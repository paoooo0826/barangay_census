begin;

alter table public.residents drop constraint residents_tenurial_status_check;
alter table public.residents add constraint residents_tenurial_status_check
check (tenurial_status in ('House Owner','Sharer','Caretaker','Renter','Landlord/Landlady'));

update public.categories set description='Family Head and other needy adults' where name='FHONA';

create schema if not exists census_private;
revoke all on schema census_private from public, anon;
grant usage on schema census_private to authenticated;

-- Residence periods remain independent of boarding-house occupancy.
create table public.residency_periods (
 id uuid primary key default gen_random_uuid(),
 resident_id uuid not null references public.residents(id),
 start_date date not null,
 initial_classification text not null check (initial_classification in ('temporary','resident')),
 end_date date check (end_date >= start_date),
 ended_by uuid references auth.users(id), ended_at timestamptz,
 recorded_by uuid not null references auth.users(id),
 recorded_at timestamptz not null default now()
);
create unique index residency_one_current on public.residency_periods(resident_id) where end_date is null;
create index residency_resident on public.residency_periods(resident_id,start_date);
alter table public.residency_periods enable row level security;
revoke all on public.residency_periods from public, anon, authenticated;
grant select on public.residency_periods to authenticated;
create policy residency_read on public.residency_periods for select to authenticated
using (public.is_active_admin() or exists (select 1 from public.residents r where r.id=resident_id and r.user_id=(select auth.uid())));

create view public.residency_current with (security_invoker=true) as
 select p.*, (p.start_date + interval '6 months')::date as resident_from,
 case when p.end_date is not null then 'ended'
      when p.initial_classification='resident' or (now() at time zone 'Asia/Manila')::date >= (p.start_date + interval '6 months')::date then 'resident'
      else 'temporary' end as current_classification
 from public.residency_periods p;
-- Effective history is date-derived, so the six-month transition cannot be missed
-- when nobody opens the application or when a scheduled job is unavailable.
create view public.residency_history with (security_invoker=true) as
 select id as period_id,resident_id,start_date as effective_date,initial_classification as classification,recorded_by,recorded_at,'Residence started'::text as reason from public.residency_periods
 union all
 select id,resident_id,(start_date + interval '6 months')::date,'resident',null::uuid,null::timestamptz,'Six calendar months of continuous residence'
 from public.residency_periods where initial_classification='temporary'
 and (now() at time zone 'Asia/Manila')::date >= (start_date + interval '6 months')::date
 and (end_date is null or end_date >= (start_date + interval '6 months')::date)
 union all
 select id,resident_id,end_date,'ended',ended_by,ended_at,'Residence period ended'
 from public.residency_periods where end_date is not null;
revoke all on public.residency_current,public.residency_history from public,anon;
grant select on public.residency_current,public.residency_history to authenticated;


create function census_private.manage_residency(p_resident_id uuid,p_action text,p_date date,p_classification text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.residency_periods;
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Only administrators can manage residence periods.' using errcode='42501'; end if;
 perform 1 from public.residents where id=p_resident_id for update;
 if not found then raise exception 'Resident was not found.'; end if;
 if p_date is null or p_date > (now() at time zone 'Asia/Manila')::date then raise exception 'Enter a valid date that is not in the future.'; end if;
 if p_action='end' then
  update public.residency_periods set end_date=p_date,ended_by=auth.uid(),ended_at=now() where resident_id=p_resident_id and end_date is null and start_date<=p_date returning * into saved;
  if saved.id is null then raise exception 'No current residence period was found for this date.'; end if;
 elsif p_action='start' then
  if p_classification not in ('temporary','resident') or p_classification is null then raise exception 'Choose a residence classification.'; end if;
  if exists(select 1 from public.residency_periods where resident_id=p_resident_id and (end_date is null or end_date >= p_date)) then raise exception 'The new residence period must begin after the previous period ended.'; end if;
  insert into public.residency_periods(resident_id,start_date,initial_classification,recorded_by) values(p_resident_id,p_date,p_classification,auth.uid()) returning * into saved;
 else raise exception 'Unknown residency action.'; end if;
 return to_jsonb(saved);
end;
$$;
revoke all on function census_private.manage_residency(uuid,text,date,text) from public,anon;
grant execute on function census_private.manage_residency(uuid,text,date,text) to authenticated;
create function public.manage_residency(p_resident_id uuid,p_action text,p_date date,p_classification text default null) returns jsonb language sql security invoker set search_path='' as $$ select census_private.manage_residency(p_resident_id,p_action,p_date,p_classification); $$;
revoke all on function public.manage_residency(uuid,text,date,text) from public,anon;
grant execute on function public.manage_residency(uuid,text,date,text) to authenticated;

create table public.boarding_houses (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 150),
 address text not null check(length(trim(address)) between 3 and 500),
 owner_resident_id uuid not null references public.residents(id),
 owner_user_id uuid not null references auth.users(id),
 owner_name text not null, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index boarding_owner on public.boarding_houses(owner_user_id);
create table public.boarder_stays (
 id uuid primary key default gen_random_uuid(),
 boarding_house_id uuid not null references public.boarding_houses(id),
 resident_id uuid not null references public.residents(id), resident_name text not null, tracking_number text not null,
 move_in_date date not null, departure_date date check(departure_date >= move_in_date),
 status text not null default 'staying' check(status in ('staying','moved_out')),
 updated_by uuid not null references auth.users(id), updater_name text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((status='staying' and departure_date is null) or (status='moved_out' and departure_date is not null))
);
create unique index boarder_one_active_stay on public.boarder_stays(resident_id) where status='staying';
create index boarder_house on public.boarder_stays(boarding_house_id,move_in_date);
create table public.boarder_occupancy_history (
 id uuid primary key default gen_random_uuid(), stay_id uuid not null references public.boarder_stays(id),
 boarding_house_id uuid not null references public.boarding_houses(id), resident_id uuid not null references public.residents(id),
 action text not null check(action in ('move_in','move_out')), effective_date date not null,
 updated_by uuid not null references auth.users(id), updater_name text not null,
 recorded_at timestamptz not null default now()
);
create index boarder_history_house on public.boarder_occupancy_history(boarding_house_id,recorded_at);

alter table public.boarding_houses enable row level security;
alter table public.boarder_stays enable row level security;
alter table public.boarder_occupancy_history enable row level security;
revoke all on public.boarding_houses,public.boarder_stays,public.boarder_occupancy_history from public,anon,authenticated;
grant select on public.boarding_houses,public.boarder_stays,public.boarder_occupancy_history to authenticated;
create policy house_read on public.boarding_houses for select to authenticated
 using (public.is_active_admin() or owner_user_id=(select auth.uid()) or exists (select 1 from public.boarder_stays s join public.residents r on r.id=s.resident_id where s.boarding_house_id=boarding_houses.id and r.user_id=(select auth.uid())));
-- Avoid recursive RLS between houses and stays: authorized-house lookup is private.
create function census_private.owns_house(p_house uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (select 1 from public.boarding_houses h where h.id=p_house and h.owner_user_id=auth.uid());
$$;
revoke all on function census_private.owns_house(uuid) from public,anon;
grant execute on function census_private.owns_house(uuid) to authenticated;
create policy stays_read on public.boarder_stays for select to authenticated using
 (public.is_active_admin() or census_private.owns_house(boarding_house_id) or exists(select 1 from public.residents r where r.id=resident_id and r.user_id=(select auth.uid())));
create policy occupancy_history_read on public.boarder_occupancy_history for select to authenticated using
 (public.is_active_admin() or census_private.owns_house(boarding_house_id) or exists(select 1 from public.residents r where r.id=resident_id and r.user_id=(select auth.uid())));

create function census_private.manage_boarding(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); admin boolean; house public.boarding_houses; stay public.boarder_stays; target public.residents; actor_name text; d date; target_id uuid;
begin
 if actor is null then raise exception 'Please sign in.' using errcode='42501'; end if;
 admin:=public.is_active_admin();
 select coalesce(nullif(trim(concat_ws(' ',r.first_name,r.last_name)),''),a.full_name,'Account') into actor_name
 from auth.users u left join public.residents r on r.user_id=u.id left join public.admin_profiles a on a.user_id=u.id where u.id=actor;
 if p_action='save_house' then
  if not admin then raise exception 'Only administrators can assign boarding houses.' using errcode='42501'; end if;
  select * into target from public.residents where id=(p_payload->>'owner_resident_id')::uuid and user_id is not null;
  if target.id is null then raise exception 'Choose an owner with a registered account.'; end if;
  if p_payload->>'id' is null then
   insert into public.boarding_houses(name,address,owner_resident_id,owner_user_id,owner_name)
   values(trim(p_payload->>'name'),trim(p_payload->>'address'),target.id,target.user_id,trim(concat_ws(' ',target.first_name,target.last_name))) returning * into house;
  else
   update public.boarding_houses set name=trim(p_payload->>'name'),address=trim(p_payload->>'address'),owner_resident_id=target.id,owner_user_id=target.user_id,owner_name=trim(concat_ws(' ',target.first_name,target.last_name)),active=coalesce((p_payload->>'active')::boolean,true),updated_at=now() where id=(p_payload->>'id')::uuid returning * into house;
  end if;
  if house.id is null then raise exception 'Boarding house was not saved.'; end if;
  return to_jsonb(house);
 end if;
 if p_action='move_in' then
  select * into house from public.boarding_houses where id=(p_payload->>'house_id')::uuid for update;
 elsif p_action='move_out' then
  select * into stay from public.boarder_stays where id=(p_payload->>'stay_id')::uuid for update;
  select * into house from public.boarding_houses where id=stay.boarding_house_id;
 else raise exception 'Unknown occupancy action.'; end if;
 if house.id is null or (not admin and house.owner_user_id<>actor) then raise exception 'You can update only your assigned boarding houses.' using errcode='42501'; end if;
 if p_action='move_in' then
  if not house.active then raise exception 'This boarding house is inactive.'; end if;
  select * into target from public.residents where tracking_number=trim(p_payload->>'tracking_number') for update;
  if target.id is null then raise exception 'Resident tracking number was not found.'; end if;
  d:=nullif(p_payload->>'move_in_date','')::date;
  if d is null or d>(now() at time zone 'Asia/Manila')::date then raise exception 'Enter a valid move-in date that is not in the future.'; end if;
  if exists(select 1 from public.boarder_stays s where s.resident_id=target.id and (s.departure_date is null or s.departure_date>d)) then raise exception 'This resident has an active or overlapping stay. Close the previous stay first.'; end if;
  insert into public.boarder_stays(boarding_house_id,resident_id,resident_name,tracking_number,move_in_date,updated_by,updater_name)
  values(house.id,target.id,trim(concat_ws(' ',target.first_name,target.middle_name,target.last_name,target.suffix)),target.tracking_number,d,actor,actor_name) returning * into stay;
  insert into public.boarder_occupancy_history(stay_id,boarding_house_id,resident_id,action,effective_date,updated_by,updater_name) values(stay.id,house.id,target.id,'move_in',d,actor,actor_name);
 else
  if stay.status<>'staying' then raise exception 'This stay is already closed. Add a new stay if the resident returns.'; end if;
  d:=nullif(p_payload->>'departure_date','')::date;
  if d is null or d<stay.move_in_date or d>(now() at time zone 'Asia/Manila')::date then raise exception 'A valid departure date is required.'; end if;
  update public.boarder_stays set status='moved_out',departure_date=d,updated_by=actor,updater_name=actor_name,updated_at=now() where id=stay.id returning * into stay;
  insert into public.boarder_occupancy_history(stay_id,boarding_house_id,resident_id,action,effective_date,updated_by,updater_name) values(stay.id,house.id,stay.resident_id,'move_out',d,actor,actor_name);
 end if;
 return to_jsonb(stay);
end;
$$;
revoke all on function census_private.manage_boarding(text,jsonb) from public,anon;
grant execute on function census_private.manage_boarding(text,jsonb) to authenticated;
create function public.manage_boarding(p_action text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select census_private.manage_boarding(p_action,p_payload); $$;
revoke all on function public.manage_boarding(text,jsonb) from public,anon;
grant execute on function public.manage_boarding(text,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.save_resident_census(p_resident jsonb, p_categories jsonb DEFAULT '[]'::jsonb, p_government_id jsonb DEFAULT NULL::jsonb, p_face_verification jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid();
  actor_email text;
  target_id uuid;
  saved public.residents%rowtype;
  clean_philsys text := nullif(trim(p_resident ->> 'philsys_number'), '');
  clean_first text := trim(coalesce(p_resident ->> 'first_name', ''));
  clean_middle text := nullif(trim(p_resident ->> 'middle_name'), '');
  clean_last text := trim(coalesce(p_resident ->> 'last_name', ''));
  clean_birth date;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select lower(u.email) into actor_email from auth.users u where u.id = actor_id;
  if actor_email is null then
    raise exception 'The authenticated account does not have an email address.' using errcode = '22023';
  end if;

  clean_birth := (p_resident ->> 'birth_date')::date;
  if clean_first = '' or clean_last = '' then
    raise exception 'First and last name are required.' using errcode = '22023';
  end if;
  select r.id into target_id
  from public.residents r
  where r.user_id = actor_id
  for update;

  if nullif(p_resident ->> 'household_photo_url', '') is not null
     and split_part(p_resident ->> 'household_photo_url', '/', 1) <> actor_id::text
     and not exists (
       select 1 from public.residents r
       where r.id = target_id and r.household_photo_url = p_resident ->> 'household_photo_url'
     ) then
    raise exception 'The household image must belong to the authenticated account.' using errcode = '42501';
  end if;

  if clean_philsys is not null and exists (
    select 1 from public.residents r
    where r.id is distinct from target_id
      and regexp_replace(lower(coalesce(r.philsys_number, '')), '[^a-z0-9]', '', 'g') =
          regexp_replace(lower(clean_philsys), '[^a-z0-9]', '', 'g')
  ) then
    raise exception 'User is already registered.' using errcode = '23505';
  end if;

  if exists (
    select 1 from public.residents r
    where r.id is distinct from target_id
      and lower(trim(r.first_name)) = lower(clean_first)
      and lower(trim(r.last_name)) = lower(clean_last)
      and r.birth_date = clean_birth
      and (
        clean_middle is null
        or nullif(trim(r.middle_name), '') is null
        or lower(trim(r.middle_name)) = lower(clean_middle)
      )
  ) then
    raise exception 'User is already registered.' using errcode = '23505';
  end if;

  if target_id is null then
    insert into public.residents (
      user_id, region, province, city_municipality, barangay, philsys_number,
      last_name, suffix, first_name, middle_name, birth_date, birth_place, sex,
      civil_status, religion, residential_address, citizenship,
      profession_occupation, contact_number, email_address, highest_education,
      education_status, vocational_course, tenurial_status, monthly_rent,
      household_photo_url, status
    ) values (
      actor_id, p_resident ->> 'region', p_resident ->> 'province',
      p_resident ->> 'city_municipality', p_resident ->> 'barangay', clean_philsys,
      clean_last, nullif(trim(p_resident ->> 'suffix'), ''), clean_first, clean_middle,
      clean_birth, trim(p_resident ->> 'birth_place'), p_resident ->> 'sex',
      p_resident ->> 'civil_status', nullif(trim(p_resident ->> 'religion'), ''),
      trim(p_resident ->> 'residential_address'), trim(p_resident ->> 'citizenship'),
      nullif(trim(p_resident ->> 'profession_occupation'), ''),
      nullif(trim(p_resident ->> 'contact_number'), ''), actor_email,
      nullif(p_resident ->> 'highest_education', ''),
      nullif(p_resident ->> 'education_status', ''),
      nullif(trim(p_resident ->> 'vocational_course'), ''),
      nullif(p_resident ->> 'tenurial_status', ''),
      nullif(p_resident ->> 'monthly_rent', '')::numeric,
      nullif(p_resident ->> 'household_photo_url', ''), 'verified'
    ) returning * into saved;
    target_id := saved.id;
  else
    update public.residents set
      region = p_resident ->> 'region', province = p_resident ->> 'province',
      city_municipality = p_resident ->> 'city_municipality', barangay = p_resident ->> 'barangay',
      philsys_number = clean_philsys, last_name = clean_last,
      suffix = nullif(trim(p_resident ->> 'suffix'), ''), first_name = clean_first,
      middle_name = clean_middle, birth_date = clean_birth,
      birth_place = trim(p_resident ->> 'birth_place'), sex = p_resident ->> 'sex',
      civil_status = p_resident ->> 'civil_status', religion = nullif(trim(p_resident ->> 'religion'), ''),
      residential_address = trim(p_resident ->> 'residential_address'),
      citizenship = trim(p_resident ->> 'citizenship'),
      profession_occupation = nullif(trim(p_resident ->> 'profession_occupation'), ''),
      contact_number = nullif(trim(p_resident ->> 'contact_number'), ''), email_address = actor_email,
      highest_education = nullif(p_resident ->> 'highest_education', ''),
      education_status = nullif(p_resident ->> 'education_status', ''),
      vocational_course = nullif(trim(p_resident ->> 'vocational_course'), ''),
      tenurial_status = nullif(p_resident ->> 'tenurial_status', ''),
      monthly_rent = nullif(p_resident ->> 'monthly_rent', '')::numeric,
      household_photo_url = nullif(p_resident ->> 'household_photo_url', '')
    where id = target_id and user_id = actor_id
    returning * into saved;
  end if;

  if saved.id is null then raise exception 'Resident record could not be saved.' using errcode = 'P0002'; end if;

  delete from public.resident_categories where resident_id = target_id;
  insert into public.resident_categories (resident_id, category_id, indigenous_group, other_description)
  select target_id, c.id,
    case when c.name = 'Indigenous People' then nullif(trim(item ->> 'indigenous_group'), '') else null end,
    case when c.name = 'Others' then nullif(trim(item ->> 'other_description'), '') else null end
  from jsonb_array_elements(coalesce(p_categories, '[]'::jsonb)) item
  join public.categories c on c.id = (item ->> 'category_id')::integer;

  if exists (
    select 1 from public.resident_categories rc
    join public.categories c on c.id = rc.category_id
    where rc.resident_id = target_id and c.name = 'Indigenous People'
      and nullif(trim(rc.indigenous_group), '') is null
  ) then
    raise exception 'Indigenous group is required for the Indigenous People category.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.resident_categories rc
    join public.categories c on c.id = rc.category_id
    where rc.resident_id = target_id and c.name = 'Others'
      and nullif(trim(rc.other_description), '') is null
  ) then
    raise exception 'A description is required for the Others category.' using errcode = '22023';
  end if;

  if p_government_id is not null then
    if nullif(trim(p_government_id ->> 'id_type'), '') is null
       or nullif(p_government_id ->> 'front_image_url', '') is null
       or nullif(p_government_id ->> 'back_image_url', '') is null then
      raise exception 'Government ID type, front image, and back image are required.' using errcode = '22023';
    end if;
    if (split_part(p_government_id ->> 'front_image_url', '/', 1) <> actor_id::text
       and not exists (select 1 from public.government_ids g where g.resident_id = target_id and g.front_image_url = p_government_id ->> 'front_image_url'))
       or (split_part(p_government_id ->> 'back_image_url', '/', 1) <> actor_id::text
       and not exists (select 1 from public.government_ids g where g.resident_id = target_id and g.back_image_url = p_government_id ->> 'back_image_url')) then
      raise exception 'Government ID images must belong to the authenticated account.' using errcode = '42501';
    end if;
    insert into public.government_ids (resident_id, id_type, front_image_url, back_image_url)
    values (target_id, trim(p_government_id ->> 'id_type'), p_government_id ->> 'front_image_url', p_government_id ->> 'back_image_url')
    on conflict (resident_id) do update set
      id_type = excluded.id_type, front_image_url = excluded.front_image_url,
      back_image_url = excluded.back_image_url;
  end if;

  if p_face_verification is not null then
    if nullif(p_face_verification ->> 'captured_face_url', '') is not null
       and split_part(p_face_verification ->> 'captured_face_url', '/', 1) <> actor_id::text
       and not exists (select 1 from public.face_verifications f where f.resident_id = target_id and f.captured_face_url = p_face_verification ->> 'captured_face_url') then
      raise exception 'The face image must belong to the authenticated account.' using errcode = '42501';
    end if;
    insert into public.face_verifications (
      resident_id, captured_face_url, is_matched, match_distance, similarity_score,
      liveness_passed, liveness_actions, verification_recommendation, id_quality,
      verification_status, verification_reason, device_type
    ) values (
      target_id, nullif(p_face_verification ->> 'captured_face_url', ''),
      coalesce((p_face_verification ->> 'is_matched')::boolean, false),
      nullif(p_face_verification ->> 'match_distance', '')::double precision,
      nullif(p_face_verification ->> 'similarity_score', '')::double precision,
      coalesce((p_face_verification ->> 'liveness_passed')::boolean, false),
      coalesce(p_face_verification -> 'liveness_actions', '[]'::jsonb),
      coalesce(nullif(p_face_verification ->> 'verification_recommendation', ''), 'manual_review'),
      coalesce(p_face_verification -> 'id_quality', '{}'::jsonb),
      coalesce(nullif(p_face_verification ->> 'verification_status', ''), 'skipped'),
      nullif(p_face_verification ->> 'verification_reason', ''),
      nullif(p_face_verification ->> 'device_type', '')
    )
    on conflict (resident_id) do update set
      captured_face_url = excluded.captured_face_url, is_matched = excluded.is_matched,
      match_distance = excluded.match_distance, similarity_score = excluded.similarity_score,
      liveness_passed = excluded.liveness_passed, liveness_actions = excluded.liveness_actions,
      verification_recommendation = excluded.verification_recommendation,
      id_quality = excluded.id_quality, verification_status = excluded.verification_status,
      verification_reason = excluded.verification_reason, device_type = excluded.device_type;
  end if;

  if nullif(p_resident ->> 'residence_start_date', '') is not null then
    if (p_resident ->> 'residence_start_date')::date > (now() at time zone 'Asia/Manila')::date
       or coalesce(p_resident ->> 'residence_classification', '') not in ('temporary','resident') then
      raise exception 'Provide a valid residence start date and classification.' using errcode='22023';
    end if;
    if exists (select 1 from public.residency_periods where resident_id=target_id and end_date is null
       and (start_date <> (p_resident ->> 'residence_start_date')::date or initial_classification <> p_resident ->> 'residence_classification')) then
      raise exception 'The original residence date and classification are preserved. Ask the barangay administrator about corrections.' using errcode='22023';
    end if;
    if not exists(select 1 from public.residency_periods where resident_id=target_id and end_date is null)
       and exists(select 1 from public.residency_periods where resident_id=target_id and end_date >= (p_resident ->> 'residence_start_date')::date) then
      raise exception 'A new residence period must start after the previous period ended.' using errcode='22023';
    end if;
    insert into public.residency_periods(resident_id,start_date,initial_classification,recorded_by)
    select target_id,(p_resident ->> 'residence_start_date')::date,p_resident ->> 'residence_classification',actor_id
    where not exists(select 1 from public.residency_periods where resident_id=target_id and end_date is null);
  end if;
  return to_jsonb(saved);
end;
$function$;

commit;

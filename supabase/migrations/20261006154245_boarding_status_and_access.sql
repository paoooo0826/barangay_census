begin;

alter table public.residents
  add column boarding_status text not null default 'neither' check (boarding_status in ('boarder','landlord','neither')),
  add column boarding_house_name text,
  add column boarding_house_address text,
  add column boarding_landlord_name text,
  add column boarding_start_date date,
  add column boarding_tenant_count integer check (boarding_tenant_count between 0 and 100000),
  add column boarding_contact text;
create index residents_boarding_status_idx on public.residents(boarding_status);

-- Existing assignments are stronger evidence than tenure alone. Owners take
-- precedence for dual-role legacy records; their past stays remain untouched.
update public.residents r set boarding_status='landlord'
where r.tenurial_status='Landlord/Landlady'
   or exists(select 1 from public.boarding_houses h where h.owner_resident_id=r.id);
update public.residents r set boarding_status='boarder'
where r.boarding_status='neither'
  and exists(select 1 from public.boarder_stays s where s.resident_id=r.id and s.status='staying');
update public.residents r set boarding_house_name=h.name,boarding_house_address=h.address,
  boarding_tenant_count=(select count(*) from public.boarder_stays s where s.boarding_house_id=h.id and s.status='staying')
from (select distinct on (owner_resident_id) * from public.boarding_houses
      order by owner_resident_id,active desc,updated_at desc,id) h
where r.id=h.owner_resident_id and r.boarding_status='landlord';
update public.residents r set boarding_house_name=h.name,boarding_house_address=h.address,
  boarding_landlord_name=h.owner_name,boarding_start_date=s.move_in_date
from public.boarder_stays s join public.boarding_houses h on h.id=s.boarding_house_id
where r.id=s.resident_id and s.status='staying' and r.boarding_status='boarder';

alter table public.residents drop constraint residents_monthly_rent_positive_check;
alter table public.residents add constraint residents_monthly_rent_positive_check
  check(monthly_rent is null or monthly_rent > 0 or (boarding_status='boarder' and monthly_rent=0));

create or replace function private.validate_boarding_details()
returns trigger language plpgsql security invoker set search_path='' as $$
declare validate_details boolean;
begin
  new.boarding_house_name:=nullif(trim(new.boarding_house_name),'');
  new.boarding_house_address:=nullif(trim(new.boarding_house_address),'');
  new.boarding_landlord_name:=nullif(trim(new.boarding_landlord_name),'');
  new.boarding_contact:=nullif(trim(new.boarding_contact),'');
  if new.boarding_status='neither' then
    new.boarding_house_name:=null; new.boarding_house_address:=null;
    new.boarding_landlord_name:=null; new.boarding_start_date:=null;
    new.boarding_tenant_count:=null; new.boarding_contact:=null;
  elsif new.boarding_status='boarder' then
    new.boarding_tenant_count:=null; new.boarding_contact:=null;
  elsif new.boarding_status='landlord' then
    new.boarding_landlord_name:=null; new.boarding_start_date:=null;
  end if;
  if tg_op='UPDATE' and old.boarding_status='boarder' and new.boarding_status<>'boarder'
      and coalesce(new.tenurial_status,'')<>'Renter' then new.monthly_rent:=null; end if;
  validate_details:=tg_op='INSERT';
  if tg_op='UPDATE' then
    validate_details:=row(new.boarding_status,new.boarding_house_name,new.boarding_house_address,
      new.boarding_landlord_name,new.boarding_start_date,new.boarding_tenant_count,new.boarding_contact,new.birth_date)
      is distinct from row(old.boarding_status,old.boarding_house_name,old.boarding_house_address,
      old.boarding_landlord_name,old.boarding_start_date,old.boarding_tenant_count,old.boarding_contact,old.birth_date);
  end if;
  if validate_details and new.boarding_status in ('boarder','landlord') then
    if new.boarding_house_name is null or length(new.boarding_house_name) not between 2 and 150
        or new.boarding_house_address is null or length(new.boarding_house_address) not between 3 and 500 then
      raise exception 'Enter the boarding house name and address.' using errcode='22023';
    end if;
    if new.boarding_status='boarder' then
      if new.boarding_landlord_name is null or length(new.boarding_landlord_name) not between 2 and 150 then
        raise exception 'Enter the landlord/landlady name.' using errcode='22023';
      end if;
      if new.boarding_start_date is null or new.boarding_start_date<new.birth_date
          or new.boarding_start_date>(now() at time zone 'Asia/Manila')::date then
        raise exception 'Enter a valid boarding start date between your birth date and today.' using errcode='22023';
      end if;
    else
      if new.boarding_tenant_count is null then raise exception 'Enter the number of boarders/tenants.' using errcode='22023'; end if;
      if length(new.boarding_contact)>150 then raise exception 'Boarding contact information must be at most 150 characters.' using errcode='22023'; end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_boarding_details() from public,anon,authenticated;
create trigger validate_boarding_details before insert or update on public.residents
for each row execute function private.validate_boarding_details();

create or replace function census_private.owns_house(p_house uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from public.boarding_houses h join public.residents r on r.id=h.owner_resident_id
    where h.id=p_house and h.owner_user_id=auth.uid() and r.user_id=auth.uid() and r.boarding_status='landlord');
$$;
revoke all on function census_private.owns_house(uuid) from public,anon;
grant execute on function census_private.owns_house(uuid) to authenticated;

drop policy house_read on public.boarding_houses;
create policy house_read on public.boarding_houses for select to authenticated using (
  public.is_active_admin() or census_private.owns_house(id) or exists (
    select 1 from public.boarder_stays s join public.residents r on r.id=s.resident_id
    where s.boarding_house_id=boarding_houses.id and r.user_id=(select auth.uid()) and r.boarding_status='boarder'));
drop policy stays_read on public.boarder_stays;
create policy stays_read on public.boarder_stays for select to authenticated using (
  public.is_active_admin() or census_private.owns_house(boarding_house_id) or exists (
    select 1 from public.residents r where r.id=resident_id and r.user_id=(select auth.uid()) and r.boarding_status='boarder'));
drop policy occupancy_history_read on public.boarder_occupancy_history;
create policy occupancy_history_read on public.boarder_occupancy_history for select to authenticated using (
  public.is_active_admin() or census_private.owns_house(boarding_house_id) or exists (
    select 1 from public.residents r where r.id=resident_id and r.user_id=(select auth.uid()) and r.boarding_status='boarder'));
CREATE OR REPLACE FUNCTION private.save_resident_census(p_resident jsonb, p_categories jsonb DEFAULT '[]'::jsonb, p_government_id jsonb DEFAULT NULL::jsonb, p_face_verification jsonb DEFAULT NULL::jsonb)
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

  if target_id is null and (p_government_id is null or p_government_id = 'null'::jsonb
      or p_face_verification is null or p_face_verification = 'null'::jsonb) then
    raise exception 'Complete ID and live photo verification before submitting your census.' using errcode='22023';
  end if;
  if target_id is not null and p_government_id is not null and p_government_id <> 'null'::jsonb
     and exists (select 1 from public.government_ids g where g.resident_id = target_id
       and (g.front_image_url is distinct from p_government_id ->> 'front_image_url'
         or g.back_image_url is distinct from p_government_id ->> 'back_image_url'))
     and (p_face_verification is null or p_face_verification = 'null'::jsonb
       or exists (select 1 from public.face_verifications f where f.resident_id = target_id
         and f.captured_face_url is not distinct from p_face_verification ->> 'captured_face_url')) then
    raise exception 'Complete a new live verification when replacing government ID photos.' using errcode = '22023';
  end if;

  if p_government_id is not null and p_government_id <> 'null'::jsonb then
    perform private.require_verification_image(p_government_id ->> 'front_image_url', actor_id, target_id, 'front');
    perform private.require_verification_image(p_government_id ->> 'back_image_url', actor_id, target_id, 'back');
  end if;
  if p_face_verification is not null and p_face_verification <> 'null'::jsonb then
    perform private.require_verification_image(p_face_verification ->> 'captured_face_url', actor_id, target_id, 'face');
    if coalesce(p_face_verification ->> 'verification_status', '') <> 'passed'
       or coalesce((p_face_verification ->> 'liveness_passed')::boolean, false) <> true
       or jsonb_typeof(p_face_verification -> 'liveness_actions') is distinct from 'array'
       or jsonb_array_length(p_face_verification -> 'liveness_actions') < 3
       or coalesce(p_face_verification ->> 'verification_recommendation','') not in ('match','manual_review') then
      raise exception 'A successful live capture is required before submitting verification evidence.' using errcode='22023';
    end if;
  end if;

  if p_face_verification is not null and p_face_verification <> 'null'::jsonb then
    if (select count(distinct value) from jsonb_array_elements_text(p_face_verification->'liveness_actions')) < 3
       or exists(select 1 from jsonb_array_elements_text(p_face_verification->'liveness_actions') action(value)
         where value not in ('blink_twice','turn_left','turn_right','smile','move_closer')) then
      raise exception 'Complete three different live verification movements before submitting.' using errcode='22023';
    end if;
  end if;

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
      boarding_status, boarding_house_name, boarding_house_address, boarding_landlord_name, boarding_start_date, boarding_tenant_count, boarding_contact,
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
      coalesce(p_resident ->> 'boarding_status','neither'),
      nullif(trim(p_resident ->> 'boarding_house_name'),''),
      nullif(trim(p_resident ->> 'boarding_house_address'),''),
      nullif(trim(p_resident ->> 'boarding_landlord_name'),''),
      nullif(p_resident ->> 'boarding_start_date','')::date,
      nullif(p_resident ->> 'boarding_tenant_count','')::integer,
      nullif(trim(p_resident ->> 'boarding_contact'),''),
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
      boarding_status = case when p_resident ? 'boarding_status' then coalesce(p_resident ->> 'boarding_status','neither') else boarding_status end,
      boarding_house_name = case when p_resident ? 'boarding_status' then nullif(trim(p_resident ->> 'boarding_house_name'),'') else boarding_house_name end,
      boarding_house_address = case when p_resident ? 'boarding_status' then nullif(trim(p_resident ->> 'boarding_house_address'),'') else boarding_house_address end,
      boarding_landlord_name = case when p_resident ? 'boarding_status' then nullif(trim(p_resident ->> 'boarding_landlord_name'),'') else boarding_landlord_name end,
      boarding_start_date = case when p_resident ? 'boarding_status' then nullif(p_resident ->> 'boarding_start_date','')::date else boarding_start_date end,
      boarding_tenant_count = case when p_resident ? 'boarding_status' then nullif(p_resident ->> 'boarding_tenant_count','')::integer else boarding_tenant_count end,
      boarding_contact = case when p_resident ? 'boarding_status' then nullif(trim(p_resident ->> 'boarding_contact'),'') else boarding_contact end,
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

  if p_government_id is not null and p_government_id <> 'null'::jsonb then
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

  if p_face_verification is not null and p_face_verification <> 'null'::jsonb then
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
$function$
;
CREATE OR REPLACE FUNCTION census_private.manage_boarding(p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); admin boolean; house public.boarding_houses; stay public.boarder_stays; target public.residents; actor_name text; d date; target_id uuid;
begin
 if actor is null then raise exception 'Please sign in.' using errcode='42501'; end if;
 admin:=public.is_active_admin();
 if not admin and not exists(select 1 from public.residents r where r.user_id=actor and r.boarding_status='landlord') then raise exception 'Landlord/Landlady boarding status is required.' using errcode='42501'; end if;
 select coalesce(nullif(trim(concat_ws(' ',r.first_name,r.last_name)),''),a.full_name,'Account') into actor_name
 from auth.users u left join public.residents r on r.user_id=u.id left join public.admin_profiles a on a.user_id=u.id where u.id=actor;
 if p_action='save_house' then
  if not admin then raise exception 'Only administrators can assign boarding houses.' using errcode='42501'; end if;
  select * into target from public.residents where id=(p_payload->>'owner_resident_id')::uuid and user_id is not null;
  if target.id is null then raise exception 'Choose an owner with a registered account.'; end if;
  if target.boarding_status<>'landlord' then raise exception 'Choose a resident whose Boarding Status is Landlord/Landlady.' using errcode='22023'; end if;
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
  if target.boarding_status<>'boarder' then raise exception 'This resident must select Boarder in their census before a stay can be recorded.' using errcode='22023'; end if;
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
$function$
;
create or replace view public.admin_resident_records with (security_invoker=true) as
 SELECT r.id,
    r.user_id,
    r.tracking_number,
    r.region,
    r.province,
    r.city_municipality,
    r.barangay,
    r.philsys_number,
    r.last_name,
    r.suffix,
    r.first_name,
    r.middle_name,
    r.birth_date,
    r.birth_place,
    r.sex,
    r.civil_status,
    r.religion,
    r.residential_address,
    r.citizenship,
    r.profession_occupation,
    r.contact_number,
    r.email_address,
    r.highest_education,
    r.education_status,
    r.vocational_course,
    r.tenurial_status,
    r.monthly_rent,
    r.status,
    r.submitted_at,
    r.verified_at,
    r.created_at,
    r.updated_at,
    r.household_photo_url,
    r.philsys_number_normalized,
    p.start_date AS residence_start_date,
    p.current_classification AS residence_classification,
    concat_ws(' '::text, r.first_name, r.middle_name, r.last_name, r.suffix, r.tracking_number, r.residential_address, r.boarding_status, CASE r.boarding_status WHEN 'boarder' THEN 'Boarder' WHEN 'landlord' THEN 'Landlord/Landlady' ELSE 'Neither' END, r.boarding_house_name, r.boarding_house_address, r.boarding_landlord_name) AS search_text,
    r.boarding_status,
    r.boarding_house_name,
    r.boarding_house_address,
    r.boarding_landlord_name,
    r.boarding_start_date,
    r.boarding_tenant_count,
    r.boarding_contact
   FROM residents r
     LEFT JOIN residency_current p ON p.resident_id = r.id AND p.end_date IS NULL;
notify pgrst, 'reload schema';
commit;

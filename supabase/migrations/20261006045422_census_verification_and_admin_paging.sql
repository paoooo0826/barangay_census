begin;
set local lock_timeout = '5s';
create schema if not exists private;

-- Own-account lookup only. No broad access to auth.users is granted.
create or replace function private.current_account_email()
returns text language sql stable security definer set search_path=''
as $$ select lower(email) from auth.users where id=(select auth.uid()) $$;
revoke all on function private.current_account_email() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.current_account_email() to authenticated;

-- Only new/replaced evidence must pass Storage validation; unchanged legacy
-- references remain readable/editable. This checks files, not biometric truth.
create or replace function private.require_verification_image(
  p_path text, p_actor uuid, p_resident uuid, p_kind text
) returns void language plpgsql security invoker set search_path=''
as $$
declare previous_path text;
begin
  if p_kind='face' then
    select captured_face_url into previous_path from public.face_verifications where resident_id=p_resident;
  elsif p_kind='front' then
    select front_image_url into previous_path from public.government_ids where resident_id=p_resident;
  else
    select back_image_url into previous_path from public.government_ids where resident_id=p_resident;
  end if;
  if nullif(p_path,'') is not null and p_path=previous_path then return; end if;
  if nullif(p_path,'') is null or split_part(p_path,'/',1) <> p_actor::text
      or not exists (
        select 1 from storage.objects o
        where o.name=p_path
          and o.bucket_id='resident-verification'
          and coalesce(o.owner_id,o.owner::text)=p_actor::text
          and coalesce((o.metadata->>'size')::numeric,0)>0
          and o.metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')
          and o.is_delete_marker is not true
      ) then
    raise exception 'Upload a non-empty ID/live photo owned by your account before submitting.' using errcode='22023';
  end if;
end; $$;
revoke all on function private.require_verification_image(text,uuid,uuid,text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_resident_review_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid();
  actor_is_admin boolean := actor_id is not null and public.is_active_admin();
  account_email text;
begin
  if actor_id is not null and not actor_is_admin then
    account_email := private.current_account_email();
    if account_email is null then
      raise exception 'The authenticated account does not have an email address.' using errcode = '22023';
    end if;
    new.email_address := account_email;
  end if;

  if tg_op = 'INSERT' then
    if not actor_is_admin then
      if actor_id is not null then new.user_id := actor_id; end if;
      new.status := 'verified';
      new.submitted_at := now();
      new.created_at := now();
    end if;
    if new.status not in ('verified', 'rejected') then
      raise exception 'New census records must be approved or rejected' using errcode = '22023';
    end if;
    new.verified_at := case when new.status = 'verified' then now() else null end;
  elsif actor_id is not null and not actor_is_admin then
    new.id := old.id;
    new.user_id := old.user_id;
    new.tracking_number := old.tracking_number;
    new.submitted_at := old.submitted_at;
    new.created_at := old.created_at;
    new.status := old.status;
    new.verified_at := old.verified_at;
  elsif new.status is distinct from old.status then
    if new.status not in ('verified', 'rejected') then
      raise exception 'Census records can only be approved or rejected' using errcode = '22023';
    end if;
    new.verified_at := case when new.status = 'verified' then now() else null end;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;
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
$function$;

-- Keep the existing API/signature; privileged implementation stays unexposed.
create or replace function public.save_resident_census(
  p_resident jsonb, p_categories jsonb default '[]'::jsonb,
  p_government_id jsonb default null, p_face_verification jsonb default null
) returns jsonb language sql security invoker set search_path=''
as $$ select private.save_resident_census(p_resident,p_categories,p_government_id,p_face_verification) $$;
revoke all on function private.save_resident_census(jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function private.save_resident_census(jsonb,jsonb,jsonb,jsonb) to authenticated;
revoke all on function public.save_resident_census(jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_resident_census(jsonb,jsonb,jsonb,jsonb) to authenticated;

-- New records/evidence must use the atomic, validated RPC.
drop policy if exists "Residents insert own approved census" on public.residents;
revoke insert on public.residents from authenticated,anon;
revoke insert,update,delete on public.government_ids,public.face_verifications from authenticated,anon;

-- Fix a legacy helper's implicit search path.
create or replace function public.is_admin(user_uuid uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.admin_profiles where user_id=user_uuid and is_active=true) $$;

create or replace view public.admin_resident_records with (security_invoker=true) as
select r.*, p.start_date as residence_start_date,
  p.current_classification as residence_classification,
  concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix,r.tracking_number,r.residential_address) as search_text
from public.residents r left join public.residency_current p on p.resident_id=r.id and p.end_date is null;

create or replace view public.admin_service_records with (security_invoker=true) as
select a.*,
  jsonb_build_object('first_name',r.first_name,'middle_name',r.middle_name,'last_name',r.last_name,
    'suffix',r.suffix,'tracking_number',r.tracking_number,'contact_number',r.contact_number,
    'email_address',r.email_address) as residents,
  concat_ws(' ',r.last_name,r.first_name,r.middle_name,r.suffix) as resident_sort,
  case a.service_type when 'barangay_clearance' then 'Barangay Clearance'
    when 'certificate_of_residency' then 'Certificate of Residency'
    when 'certificate_of_indigency' then 'Certificate of Indigency' else 'Complaint' end as service_label,
  concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix,r.tracking_number,
    r.contact_number,r.email_address,
    case a.service_type when 'barangay_clearance' then 'Barangay Clearance'
      when 'certificate_of_residency' then 'Certificate of Residency'
      when 'certificate_of_indigency' then 'Certificate of Indigency' else 'Complaint' end,
    case a.service_purpose when 'low_income' then 'Low Income' when 'good_moral' then 'Good Moral Certificate'
      when 'financial' then 'Financial' when 'medical_assistance' then 'Medical Assistance Certificate' end
  ) as search_text
from public.appointments a left join public.residents r on r.id=a.resident_id;

create or replace view public.admin_announcement_list with (security_invoker=true) as
select a.*, coalesce(a.archived_at,a.updated_at) as archive_sort,
  case a.priority when 'info' then 'Information' when 'important' then 'Important' else 'Urgent' end as priority_label,
  case a.audience when 'all' then 'All residents' when 'pending_review' then 'Pending review residents'
    when 'verified' then 'Verified residents' when 'returned' then 'Residents with returned records'
    else 'Residents with rejected records' end as audience_label
from public.announcements a;
grant select on public.admin_resident_records,public.admin_service_records,public.admin_announcement_list to authenticated;
revoke all on public.admin_resident_records,public.admin_service_records,public.admin_announcement_list from anon;

create or replace function public.admin_dashboard_summary(p_mode text default 'all')
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare result jsonb; today date := (now() at time zone 'Asia/Manila')::date;
begin
  if auth.uid() is null or not public.is_active_admin() then
    raise exception 'Administrator access is required.' using errcode='42501';
  end if;
  if p_mode not in ('all','active','history','services') then
    raise exception 'Invalid appointment view.' using errcode='22023';
  end if;
  select jsonb_build_object(
    'stats', (select jsonb_build_object('total',count(*),'verified',count(*) filter(where status='verified'),
      'pending',count(*) filter(where status='pending_review'),'rejected',count(*) filter(where status='rejected')) from public.residents),
    'appointments', (select jsonb_build_object(
      'total', count(*) filter(where p_mode in ('all','services') or (p_mode='active' and status in ('pending','confirmed'))
        or (p_mode='history' and status in ('completed','cancelled','rejected'))),
      'today', count(*) filter(where appointment_date=today and status not in ('cancelled','rejected')),
      'completedToday', count(*) filter(where status='completed' and (completed_at at time zone 'Asia/Manila')::date=today),
      'pending', count(*) filter(where status='pending')) from public.appointments),
    'announcements', (select jsonb_build_object('active',count(*) filter(where not archived),
      'archived',count(*) filter(where archived),
      'published',count(*) filter(where not archived and is_published and (expires_at is null or expires_at>now()))) from public.announcements),
    'recentResidents', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from public.admin_resident_records order by updated_at desc nulls last,id limit 5) x),'[]'::jsonb)
  ) into result;
  return result;
end; $$;
revoke all on function public.admin_dashboard_summary(text) from public,anon;
grant execute on function public.admin_dashboard_summary(text) to authenticated;

create or replace function public.admin_census_analytics()
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_active_admin() then
    raise exception 'Administrator access is required.' using errcode='42501';
  end if;
  with approved as (select * from public.residents where status='verified'),
  ages as (select extract(year from age((now() at time zone 'Asia/Manila')::date,birth_date))::int as age from approved),
  groups(label,position) as (values ('Children (0–17)',1),('Young adults (18–30)',2),('Adults (31–59)',3),('Senior citizens (60+)',4)),
  age_counts as (select case when age<18 then 1 when age<=30 then 2 when age<60 then 3 else 4 end as position,count(*) as count from ages where age between 0 and 130 group by 1),
  sex_counts as (select coalesce(nullif(trim(sex),''),'Not specified') as label,count(*) as count from approved group by 1),
  civil_counts as (select coalesce(nullif(trim(civil_status),''),'Not specified') as label,count(*) as count from approved group by 1),
  education_counts as (select coalesce(nullif(trim(highest_education),''),'Not specified') as label,count(*) as count from approved group by 1)
  select jsonb_build_object(
    'total',(select count(*) from approved),
    'excluded',(select count(*) from public.residents where status<>'verified'),
    'age',(select jsonb_agg(jsonb_build_object('label',g.label,'count',coalesce(c.count,0)) order by g.position) from groups g left join age_counts c using(position)),
    'gender',coalesce((select jsonb_agg(to_jsonb(c) order by count desc,label) from sex_counts c),'[]'::jsonb),
    'civil',coalesce((select jsonb_agg(to_jsonb(c) order by count desc,label) from civil_counts c),'[]'::jsonb),
    'education',coalesce((select jsonb_agg(to_jsonb(c) order by count desc,label) from education_counts c),'[]'::jsonb)
  ) into result;
  return result;
end; $$;
revoke all on function public.admin_census_analytics() from public,anon;
grant execute on function public.admin_census_analytics() to authenticated;

create index if not exists residents_status_updated_id_idx on public.residents(status,updated_at desc,id);
create index if not exists appointments_status_date_id_idx on public.appointments(status,appointment_date,appointment_time,id);
create index if not exists announcements_archive_created_id_idx on public.announcements(archived,created_at desc,id);
notify pgrst,'reload schema';
commit;

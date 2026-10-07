begin;

set local lock_timeout = '10s';

alter table public.residents
  drop constraint if exists residents_highest_education_check;

alter table public.residents
  add constraint residents_highest_education_check
  check (highest_education is null or highest_education in (
    'No Formal Education', 'Pre-School', 'Kindergarten', 'Elementary',
    'High School', 'Junior High School', 'Senior High School', 'Vocational',
    'College', 'Post Graduate', 'Master''s Degree', 'Doctorate'
  ));

alter table public.residents
  drop constraint if exists residents_education_status_check;

alter table public.residents
  add constraint residents_education_status_check
  check (education_status is null or education_status in (
    'Currently Studying', 'Completed', 'Not Currently Studying', 'No Formal Education'
  ));

alter table public.residents
  drop constraint if exists residents_monthly_rent_positive_check;

alter table public.residents
  add constraint residents_monthly_rent_positive_check
  check (monthly_rent is null or monthly_rent > 0);

update public.residents r
set email_address = lower(u.email)
from auth.users u
where u.id = r.user_id
  and u.email is not null
  and r.email_address is distinct from lower(u.email);

create or replace function public.protect_resident_review_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  actor_is_admin boolean := actor_id is not null and public.is_active_admin();
  account_email text;
begin
  if actor_id is not null and not actor_is_admin then
    select lower(u.email) into account_email from auth.users u where u.id = actor_id;
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

drop trigger if exists protect_resident_review_fields_trigger on public.residents;
create trigger protect_resident_review_fields_trigger
before insert or update on public.residents
for each row execute function public.protect_resident_review_fields();

with ranked as (
  select id, row_number() over (partition by resident_id order by id) as row_number
  from public.government_ids
)
delete from public.government_ids target
using ranked
where target.id = ranked.id and ranked.row_number > 1;

with ranked as (
  select id, row_number() over (partition by resident_id order by id) as row_number
  from public.face_verifications
)
delete from public.face_verifications target
using ranked
where target.id = ranked.id and ranked.row_number > 1;

create unique index if not exists government_ids_resident_id_unique
  on public.government_ids (resident_id);

create unique index if not exists face_verifications_resident_id_unique
  on public.face_verifications (resident_id);

create or replace function public.save_resident_census(
  p_resident jsonb,
  p_categories jsonb default '[]'::jsonb,
  p_government_id jsonb default null,
  p_face_verification jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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

  return to_jsonb(saved);
end;
$function$;

revoke all on function public.save_resident_census(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_resident_census(jsonb, jsonb, jsonb, jsonb) to authenticated;

alter table public.appointments add column if not exists request_key uuid;
create unique index if not exists appointments_user_request_key_unique
  on public.appointments (user_id, request_key) where request_key is not null;

create or replace function public.book_resident_appointment(
  p_resident_id uuid,
  p_service_type text,
  p_service_purpose text,
  p_appointment_date date,
  p_appointment_time time,
  p_purpose text,
  p_expected_fee numeric,
  p_request_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  resident_user uuid;
  calculated_fee numeric;
  booked public.appointments%rowtype;
  local_now timestamp := now() at time zone 'Asia/Manila';
begin
  if actor_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select r.user_id into resident_user from public.residents r where r.id = p_resident_id;
  if resident_user is null then raise exception 'Resident record not found.' using errcode = 'P0002'; end if;
  if resident_user <> actor_id then raise exception 'You can only book your own appointment.' using errcode = '42501'; end if;
  if p_request_key is null then raise exception 'A request key is required.' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_id::text || ':' || p_request_key::text, 0));
  select * into booked from public.appointments a where a.user_id = actor_id and a.request_key = p_request_key;
  if booked.id is not null then return jsonb_build_object('booked', true, 'appointment', to_jsonb(booked)); end if;

  if extract(isodow from p_appointment_date) in (6, 7) then raise exception 'Appointments are available Monday to Friday only.' using errcode = '22023'; end if;
  if p_appointment_date + p_appointment_time <= local_now then raise exception 'Select a future appointment date and time.' using errcode = '22023'; end if;
  if trim(coalesce(p_purpose, '')) = '' then raise exception 'Appointment purpose is required.' using errcode = '22023'; end if;
  if p_service_type = 'certificate_of_residency' and p_service_purpose = 'low_income' then
    perform pg_advisory_xact_lock(hashtextextended(p_resident_id::text || ':low-income', 0));
  end if;

  calculated_fee := public.preview_appointment_fee(p_resident_id, p_service_type, p_service_purpose);
  if calculated_fee is distinct from p_expected_fee then
    return jsonb_build_object('booked', false, 'fee_changed', true, 'current_fee', calculated_fee);
  end if;

  insert into public.appointments (
    resident_id, user_id, service_type, service_purpose, fee,
    appointment_date, appointment_time, purpose, status, request_key
  ) values (
    p_resident_id, actor_id, p_service_type, p_service_purpose, calculated_fee,
    p_appointment_date, p_appointment_time, trim(p_purpose), 'pending', p_request_key
  ) returning * into booked;

  return jsonb_build_object('booked', true, 'appointment', to_jsonb(booked));
end;
$function$;

revoke all on function public.book_resident_appointment(uuid, text, text, date, time, text, numeric, uuid) from public, anon;
grant execute on function public.book_resident_appointment(uuid, text, text, date, time, text, numeric, uuid) to authenticated;

create or replace function public.transition_appointment(
  p_appointment_id uuid,
  p_expected_status text,
  p_new_status text,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare updated public.appointments%rowtype;
begin
  if auth.uid() is null or not public.is_active_admin() then
    raise exception 'Active administrator access required.' using errcode = '42501';
  end if;
  if not ((p_expected_status = 'pending' and p_new_status in ('confirmed', 'rejected')) or
          (p_expected_status = 'confirmed' and p_new_status in ('completed', 'rejected'))) then
    raise exception 'Invalid appointment status transition.' using errcode = '22023';
  end if;

  update public.appointments set
    status = p_new_status,
    admin_notes = nullif(trim(p_admin_notes), ''),
    completed_at = case when p_new_status = 'completed' then now() else completed_at end,
    updated_at = now()
  where id = p_appointment_id and status = p_expected_status
  returning * into updated;

  if updated.id is null then
    return jsonb_build_object('updated', false, 'conflict', true);
  end if;
  return jsonb_build_object('updated', true, 'appointment', to_jsonb(updated));
end;
$function$;

revoke all on function public.transition_appointment(uuid, text, text, text) from public, anon;
grant execute on function public.transition_appointment(uuid, text, text, text) to authenticated;

create or replace function public.validate_appointment_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  actor_is_admin boolean := actor_id is not null and public.is_active_admin();
  local_now timestamp := now() at time zone 'Asia/Manila';
begin
  if tg_op = 'INSERT' or new.appointment_date is distinct from old.appointment_date or new.appointment_time is distinct from old.appointment_time then
    if extract(isodow from new.appointment_date) in (6, 7) then
      raise exception 'Appointments are available Monday to Friday only.' using errcode = '22023';
    end if;
    if new.appointment_time not in (
      time '08:00', time '08:30', time '09:00', time '09:30', time '10:00',
      time '10:30', time '11:00', time '11:30', time '13:00', time '13:30',
      time '14:00', time '14:30', time '15:00', time '15:30', time '16:00'
    ) then
      raise exception 'Select an available appointment time.' using errcode = '22023';
    end if;
    if new.appointment_date + new.appointment_time <= local_now then
      raise exception 'Select a future appointment date and time.' using errcode = '22023';
    end if;
  end if;

  if tg_op = 'UPDATE' and not actor_is_admin then
    if actor_id is null or old.user_id <> actor_id then
      raise exception 'You cannot update this appointment.' using errcode = '42501';
    end if;
    if new.status <> 'cancelled' or old.status not in ('pending', 'confirmed') then
      raise exception 'Residents can only cancel an active appointment.' using errcode = '42501';
    end if;
    new.resident_id := old.resident_id;
    new.user_id := old.user_id;
    new.service_type := old.service_type;
    new.service_purpose := old.service_purpose;
    new.fee := old.fee;
    new.appointment_date := old.appointment_date;
    new.appointment_time := old.appointment_time;
    new.purpose := old.purpose;
    new.admin_notes := old.admin_notes;
    new.completed_at := old.completed_at;
    new.request_key := old.request_key;
  end if;
  return new;
end;
$function$;

drop trigger if exists validate_appointment_change_trigger on public.appointments;
create trigger validate_appointment_change_trigger
before insert or update on public.appointments
for each row execute function public.validate_appointment_change();

create or replace function public.can_view_announcement_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null and (
    public.is_active_admin()
    or exists (
      select 1
      from public.announcements a
      join public.residents r on r.user_id = auth.uid()
      where a.image_path = object_name
        and a.is_published = true
        and (a.expires_at is null or a.expires_at > now())
        and (a.audience = 'all' or a.audience = r.status)
    )
  );
$function$;

revoke all on function public.can_view_announcement_image(text) from public, anon;
grant execute on function public.can_view_announcement_image(text) to authenticated;

drop policy if exists "Authenticated users view announcement images" on storage.objects;
drop policy if exists "Authorized users view announcement images" on storage.objects;
create policy "Authorized users view announcement images"
on storage.objects for select to authenticated
using (bucket_id = 'announcement-images' and public.can_view_announcement_image(name));

drop policy if exists "Authenticated users view household images" on storage.objects;
create policy "Residents and admins view household images"
on storage.objects for select to authenticated
using (
  bucket_id = 'household-images'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_active_admin())
);

drop policy if exists "Residents delete own verification files" on storage.objects;
create policy "Residents delete own verification files"
on storage.objects for delete to authenticated
using (bucket_id = 'resident-verification' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Residents delete own household images" on storage.objects;
create policy "Residents delete own household images"
on storage.objects for delete to authenticated
using (bucket_id = 'household-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Anyone can view government IDs" on storage.objects;
drop policy if exists "Authenticated users can upload government IDs" on storage.objects;
drop policy if exists "Users can update their files" on storage.objects;
drop policy if exists "Users can delete their files" on storage.objects;
drop policy if exists "Owners and admins view legacy verification files" on storage.objects;
drop policy if exists "Owners upload legacy verification files" on storage.objects;
drop policy if exists "Owners update legacy verification files" on storage.objects;
drop policy if exists "Owners delete legacy verification files" on storage.objects;

create policy "Owners and admins view legacy verification files"
on storage.objects for select to authenticated
using (
  bucket_id in ('government-ids', 'face-captures')
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_active_admin())
);
create policy "Owners upload legacy verification files"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('government-ids', 'face-captures')
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "Owners update legacy verification files"
on storage.objects for update to authenticated
using (
  bucket_id in ('government-ids', 'face-captures')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id in ('government-ids', 'face-captures')
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "Owners delete legacy verification files"
on storage.objects for delete to authenticated
using (
  bucket_id in ('government-ids', 'face-captures')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Admins update own announcements" on public.announcements;
drop policy if exists "Admins update announcements" on public.announcements;
drop policy if exists "Active admins can update announcements" on public.announcements;
create policy "Admins update announcements"
on public.announcements for update to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

notify pgrst, 'reload schema';

commit;

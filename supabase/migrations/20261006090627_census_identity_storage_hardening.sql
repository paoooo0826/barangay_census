begin;
set local lock_timeout = '5s';

create or replace function private.resident_name(value text)
returns text language sql immutable parallel safe set search_path = ''
as $$ select regexp_replace(lower(btrim(coalesce(value, ''))), '[[:space:]]+', ' ', 'g') $$;
revoke all on function private.resident_name(text) from public, anon;
grant execute on function private.resident_name(text) to authenticated;

-- A write to the shared identity key serializes registrations, including an
-- unknown middle name. Snapshot-isolated contenders receive a serialization
-- error instead of committing two conflicting records. No resident is merged.
create table private.resident_identity_locks (
  identity_key text primary key,
  revision bigint not null default 0
);
alter table private.resident_identity_locks enable row level security;
revoke all on private.resident_identity_locks from public, anon, authenticated;

create index residents_identity_lookup_idx on public.residents (
  private.resident_name(first_name), private.resident_name(last_name), birth_date
);

create or replace function private.enforce_resident_identity()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  first_value text := private.resident_name(new.first_name);
  last_value text := private.resident_name(new.last_name);
  middle_value text := private.resident_name(new.middle_name);
  philsys_value text := regexp_replace(lower(coalesce(new.philsys_number, '')), '[^a-z0-9]', '', 'g');
  lock_key text;
begin
  if auth.uid() is null and current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and
     (first_value, last_value, middle_value, new.birth_date, philsys_value) is not distinct from
     (private.resident_name(old.first_name), private.resident_name(old.last_name),
      private.resident_name(old.middle_name), old.birth_date,
      regexp_replace(lower(coalesce(old.philsys_number, '')), '[^a-z0-9]', '', 'g')) then
    return new;
  end if;
  if first_value = '' or last_value = '' or new.birth_date is null then
    raise exception 'First name, last name, and birth date are required.' using errcode = '22023';
  end if;
  for lock_key in
    select key from (
      select 'identity:' || md5(jsonb_build_array(first_value, last_value, new.birth_date)::text) as key
      union all
      select 'philsys:' || md5(philsys_value) where philsys_value <> ''
    ) keys order by key
  loop
    insert into private.resident_identity_locks(identity_key) values (lock_key)
    on conflict (identity_key) do update set revision = resident_identity_locks.revision + 1;
  end loop;
  if exists (
    select 1 from public.residents r
    where r.id is distinct from new.id
      and private.resident_name(r.first_name) = first_value
      and private.resident_name(r.last_name) = last_value
      and r.birth_date = new.birth_date
      and (middle_value = '' or private.resident_name(r.middle_name) = ''
           or private.resident_name(r.middle_name) = middle_value)
  ) or (philsys_value <> '' and exists (
    select 1 from public.residents r where r.id is distinct from new.id
      and regexp_replace(lower(coalesce(r.philsys_number, '')), '[^a-z0-9]', '', 'g') = philsys_value
  )) then
    raise exception 'User is already registered.' using errcode = '23505';
  end if;
  return new;
end $$;
revoke all on function private.enforce_resident_identity() from public, anon, authenticated;
create trigger validate_resident_identity_trigger before insert or update on public.residents
for each row execute function private.enforce_resident_identity();

-- Remove DDL-style capabilities from browser roles; normal reads, resident
-- edits, and administrator review updates retain their existing grants/RLS.
revoke truncate, references, trigger on public.residents, public.government_ids,
  public.face_verifications from anon, authenticated;

-- Referenced evidence is immutable for residents in both current and legacy
-- buckets. Only unused files owned by the current account may be replaced or
-- removed. The restrictive policies also cover duplicate permissive policies.
create or replace function private.verification_image_is_mutable(p_bucket text, p_path text)
returns boolean language sql volatile security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and p_bucket in ('resident-verification', 'government-ids', 'face-captures')
    and split_part(p_path, '/', 1) = (select auth.uid())::text
    and not exists (select 1 from public.government_ids g
      where g.front_image_url = p_path or g.back_image_url = p_path)
    and not exists (select 1 from public.face_verifications f
      where f.captured_face_url = p_path);
$$;
revoke all on function private.verification_image_is_mutable(text, text) from public, anon;
grant execute on function private.verification_image_is_mutable(text, text) to authenticated;
create index government_ids_front_image_idx on public.government_ids(front_image_url);
create index government_ids_back_image_idx on public.government_ids(back_image_url);
create index face_verifications_image_idx on public.face_verifications(captured_face_url);

create policy "Submitted verification files cannot be overwritten" on storage.objects
as restrictive for update to authenticated
using (bucket_id not in ('resident-verification', 'government-ids', 'face-captures')
  or private.verification_image_is_mutable(bucket_id, name))
with check (bucket_id not in ('resident-verification', 'government-ids', 'face-captures')
  or private.verification_image_is_mutable(bucket_id, name));
create policy "Submitted verification files cannot be deleted" on storage.objects
as restrictive for delete to authenticated
using (bucket_id not in ('resident-verification', 'government-ids', 'face-captures')
  or private.verification_image_is_mutable(bucket_id, name));
create policy "Submitted verification paths cannot be reused" on storage.objects
as restrictive for insert to authenticated
with check (bucket_id not in ('resident-verification', 'government-ids', 'face-captures')
  or private.verification_image_is_mutable(bucket_id, name));

create or replace function private.require_verification_image(
  p_path text, p_actor uuid, p_resident uuid, p_kind text
) returns void language plpgsql security invoker set search_path = ''
as $$
declare previous_path text; image_exists boolean;
begin
  if p_kind = 'face' then
    select captured_face_url into previous_path from public.face_verifications where resident_id = p_resident;
  elsif p_kind = 'front' then
    select front_image_url into previous_path from public.government_ids where resident_id = p_resident;
  else
    select back_image_url into previous_path from public.government_ids where resident_id = p_resident;
  end if;
  if nullif(p_path, '') is not null and p_path = previous_path then return; end if;
  if nullif(p_path, '') is null or split_part(p_path, '/', 1) <> p_actor::text then
    raise exception 'Upload a non-empty ID/live photo owned by your account before submitting.' using errcode = '22023';
  end if;
  select true into image_exists from storage.objects o
  where o.name = p_path and o.bucket_id = 'resident-verification'
    and coalesce(o.owner_id, o.owner::text) = p_actor::text
    and coalesce((o.metadata->>'size')::numeric, 0) > 0
    and o.metadata->>'mimetype' in ('image/jpeg', 'image/png', 'image/webp')
    and o.is_delete_marker is not true
  for share;
  if not coalesce(image_exists, false) then
    raise exception 'Upload a non-empty ID/live photo owned by your account before submitting.' using errcode = '22023';
  end if;
end $$;
revoke all on function private.require_verification_image(text, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.can_view_announcement_image(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    public.is_active_admin() or exists (
      select 1 from public.announcements a
      join public.residents r on r.user_id = (select auth.uid())
      where a.image_path = object_name and a.is_published = true
        and a.archived = false and a.published_at <= now()
        and (a.expires_at is null or a.expires_at > now())
        and (a.audience = 'all' or a.audience = r.status)
    )
  );
$$;
revoke all on function public.can_view_announcement_image(text) from public, anon;
grant execute on function public.can_view_announcement_image(text) to authenticated;

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
$function$
;
revoke all on function private.save_resident_census(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function private.save_resident_census(jsonb, jsonb, jsonb, jsonb) to authenticated;

commit;

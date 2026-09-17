begin;

alter table public.appointments
  add column if not exists service_purpose text;

alter table public.announcements
  add column if not exists image_path text;

alter table public.appointments
  drop constraint if exists appointments_service_type_check;

alter table public.appointments
  add constraint appointments_service_type_check
  check (service_type in (
    'barangay_clearance',
    'certificate_of_residency',
    'certificate_of_indigency',
    'complaint'
  ));

alter table public.appointments
  drop constraint if exists appointments_service_purpose_check;

alter table public.appointments
  add constraint appointments_service_purpose_check
  check (
    service_purpose is null
    or service_purpose in ('low_income', 'good_moral', 'financial', 'medical_assistance')
  );

create or replace function public.preview_appointment_fee(
  p_resident_id uuid,
  p_service_type text,
  p_service_purpose text default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  resident_user uuid;
  education_status text;
  used_free_low_income boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select r.user_id, r.education_status
    into resident_user, education_status
  from public.residents r
  where r.id = p_resident_id;

  if resident_user is null then
    raise exception 'Resident record not found.' using errcode = 'P0002';
  end if;

  if resident_user <> auth.uid() and not public.is_active_admin() then
    raise exception 'Access denied.' using errcode = '42501';
  end if;

  if p_service_type = 'barangay_clearance' then
    return case when lower(coalesce(education_status, '')) = 'currently studying' then 130 else 230 end;
  end if;

  if p_service_type = 'certificate_of_residency' then
    if p_service_purpose is null or p_service_purpose not in ('low_income', 'good_moral', 'financial', 'medical_assistance') then
      raise exception 'A valid residency certificate purpose is required.' using errcode = '22023';
    end if;

    if p_service_purpose = 'low_income' then
      select exists (
        select 1
        from public.appointments a
        where a.resident_id = p_resident_id
          and a.service_type = 'certificate_of_residency'
          and a.service_purpose = 'low_income'
      ) into used_free_low_income;

      if not used_free_low_income then
        return 0;
      end if;
    end if;

    return 30;
  end if;

  raise exception 'Unsupported service type.' using errcode = '22023';
end;
$function$;

revoke all on function public.preview_appointment_fee(uuid, text, text) from public, anon;
grant execute on function public.preview_appointment_fee(uuid, text, text) to authenticated;

create or replace function public.enforce_appointment_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  resident_user uuid;
begin
  if tg_op = 'INSERT' then
    select r.user_id into resident_user
    from public.residents r
    where r.id = new.resident_id;

    if resident_user is null then
      raise exception 'Resident record not found.' using errcode = 'P0002';
    end if;

    if auth.uid() is not null and not public.is_active_admin() then
      if resident_user <> auth.uid() then
        raise exception 'You can only create appointments for your own resident record.' using errcode = '42501';
      end if;
      new.user_id := auth.uid();
    end if;

    if new.service_type not in ('barangay_clearance', 'certificate_of_residency') then
      raise exception 'This service is no longer available for new requests.' using errcode = '22023';
    end if;

    if new.service_type = 'barangay_clearance' then
      new.service_purpose := null;
    elsif new.service_purpose is null or new.service_purpose not in ('low_income', 'good_moral', 'financial', 'medical_assistance') then
      raise exception 'Select a valid Certificate of Residency purpose.' using errcode = '22023';
    end if;

    if new.service_type = 'certificate_of_residency' and new.service_purpose = 'low_income' then
      perform pg_advisory_xact_lock(hashtextextended(new.resident_id::text || ':low-income', 0));
    end if;

    new.fee := public.preview_appointment_fee(new.resident_id, new.service_type, new.service_purpose);
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists enforce_appointment_request_trigger on public.appointments;
create trigger enforce_appointment_request_trigger
before insert or update on public.appointments
for each row execute function public.enforce_appointment_request();

create or replace function public.review_resident(
  p_resident_id uuid,
  p_action text,
  p_remark text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_status text;
  current_admin_id uuid;
  clean_remark text := nullif(trim(p_remark), '');
begin
  if auth.uid() is null or not public.is_active_admin() then
    raise exception 'Active administrator access required' using errcode = '42501';
  end if;

  if p_action is null or p_action not in ('approve', 'reject') then
    raise exception 'Invalid review action' using errcode = '22023';
  end if;

  if p_action = 'reject' and clean_remark is null then
    raise exception 'A reason is required for rejected records' using errcode = '22023';
  end if;

  select id into current_admin_id
  from public.admin_profiles
  where user_id = auth.uid() and coalesce(is_active, true) = true
  limit 1;

  if current_admin_id is null then
    raise exception 'Active administrator access required' using errcode = '42501';
  end if;

  new_status := case when p_action = 'approve' then 'verified' else 'rejected' end;

  update public.residents
  set status = new_status,
      verified_at = case when p_action = 'approve' then now() else null end,
      updated_at = now()
  where id = p_resident_id;

  if not found then
    raise exception 'Resident record not found' using errcode = 'P0002';
  end if;

  if clean_remark is not null then
    insert into public.remarks (resident_id, admin_id, remark_text, status_change)
    values (p_resident_id, current_admin_id, clean_remark, new_status);
  end if;

  insert into public.notifications (resident_id, title, message)
  values (
    p_resident_id,
    case when p_action = 'approve' then 'Census Approved' else 'Census Rejected' end,
    coalesce(clean_remark, 'Your census submission has been checked and approved.')
  );

  insert into public.audit_logs (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    p_action,
    'resident',
    p_resident_id,
    jsonb_build_object('status', new_status, 'remark', coalesce(clean_remark, ''))
  );

  return jsonb_build_object('resident_id', p_resident_id, 'status', new_status);
end;
$function$;

revoke all on function public.review_resident(uuid, text, text) from public, anon;
grant execute on function public.review_resident(uuid, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'announcement-images',
  'announcement-images',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins manage announcement images" on storage.objects;
create policy "Admins manage announcement images"
on storage.objects for all to authenticated
using (bucket_id = 'announcement-images' and public.is_active_admin())
with check (bucket_id = 'announcement-images' and public.is_active_admin());

drop policy if exists "Authenticated users view announcement images" on storage.objects;
create policy "Authenticated users view announcement images"
on storage.objects for select to authenticated
using (bucket_id = 'announcement-images');

commit;

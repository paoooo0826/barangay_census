begin;

alter table public.appointments
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz;

alter table public.appointments
  drop constraint if exists appointments_cancellation_reason_check;

alter table public.appointments
  add constraint appointments_cancellation_reason_check
  check (
    cancellation_reason is null
    or char_length(btrim(cancellation_reason)) between 3 and 500
  );

alter table public.notifications
  add column if not exists category text not null default 'census',
  add column if not exists related_entity_id uuid;

alter table public.notifications
  drop constraint if exists notifications_category_check;

alter table public.notifications
  add constraint notifications_category_check
  check (category in ('census', 'appointment', 'system'));

create index if not exists notifications_resident_created_idx
  on public.notifications (resident_id, created_at desc);

create index if not exists notifications_related_entity_idx
  on public.notifications (category, related_entity_id)
  where related_entity_id is not null;

create or replace function public.cancel_resident_appointment(
  p_appointment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  clean_reason text := nullif(btrim(p_reason), '');
  cancelled public.appointments%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if clean_reason is null or char_length(clean_reason) < 3 then
    raise exception 'Enter a cancellation reason with at least 3 characters.' using errcode = '22023';
  end if;

  if char_length(clean_reason) > 500 then
    raise exception 'Cancellation reason must be 500 characters or fewer.' using errcode = '22023';
  end if;

  update public.appointments
  set status = 'cancelled',
      cancellation_reason = clean_reason,
      cancelled_at = now(),
      updated_at = now()
  where id = p_appointment_id
    and user_id = actor_id
    and status in ('pending', 'confirmed')
  returning * into cancelled;

  if cancelled.id is null then
    return jsonb_build_object(
      'cancelled', false,
      'message', 'The appointment cannot be cancelled or is no longer active.'
    );
  end if;

  insert into public.notifications (
    resident_id,
    title,
    message,
    category,
    related_entity_id
  ) values (
    cancelled.resident_id,
    'Appointment Cancelled',
    'Your appointment was cancelled. Reason: ' || clean_reason,
    'appointment',
    cancelled.id
  );

  insert into public.audit_logs (user_id, action, entity_type, entity_id, details)
  values (
    actor_id,
    'cancel',
    'appointment',
    cancelled.id,
    jsonb_build_object('reason', clean_reason, 'status', 'cancelled')
  );

  return jsonb_build_object(
    'cancelled', true,
    'message', 'Appointment cancelled successfully.',
    'appointment', to_jsonb(cancelled)
  );
end;
$function$;

revoke all on function public.cancel_resident_appointment(uuid, text)
  from public, anon;
grant execute on function public.cancel_resident_appointment(uuid, text)
  to authenticated;

create or replace function public.cancel_resident_appointment(appointment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return public.cancel_resident_appointment(
    appointment_id,
    'Cancelled by resident'
  );
end;
$function$;

revoke all on function public.cancel_resident_appointment(uuid)
  from public, anon;
grant execute on function public.cancel_resident_appointment(uuid)
  to authenticated;

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
declare
  clean_notes text := nullif(btrim(p_admin_notes), '');
  updated public.appointments%rowtype;
  notification_title text;
  notification_message text;
begin
  if auth.uid() is null or not public.is_active_admin() then
    raise exception 'Active administrator access required.' using errcode = '42501';
  end if;

  if not (
    (p_expected_status = 'pending' and p_new_status in ('confirmed', 'rejected'))
    or (p_expected_status = 'confirmed' and p_new_status in ('completed', 'rejected'))
  ) then
    raise exception 'Invalid appointment status transition.' using errcode = '22023';
  end if;

  if p_new_status = 'rejected' and clean_notes is null then
    raise exception 'A rejection reason is required.' using errcode = '22023';
  end if;

  if clean_notes is not null and char_length(clean_notes) > 1000 then
    raise exception 'Administrator notes must be 1000 characters or fewer.' using errcode = '22023';
  end if;

  update public.appointments
  set status = p_new_status,
      admin_notes = clean_notes,
      completed_at = case
        when p_new_status = 'completed' then now()
        else completed_at
      end,
      updated_at = now()
  where id = p_appointment_id
    and status = p_expected_status
  returning * into updated;

  if updated.id is null then
    return jsonb_build_object('updated', false, 'conflict', true);
  end if;

  notification_title := case p_new_status
    when 'confirmed' then 'Appointment Confirmed'
    when 'completed' then 'Appointment Completed'
    else 'Appointment Rejected'
  end;

  notification_message := case p_new_status
    when 'confirmed' then
      'Your appointment for ' || initcap(replace(updated.service_type, '_', ' '))
      || ' on ' || to_char(updated.appointment_date, 'Mon DD, YYYY')
      || ' at ' || to_char(updated.appointment_time, 'HH12:MI AM')
      || ' has been confirmed.'
    when 'completed' then
      'Your appointment for ' || initcap(replace(updated.service_type, '_', ' '))
      || ' has been marked completed.'
    else
      'Your appointment was rejected. Reason: ' || clean_notes
  end;

  insert into public.notifications (
    resident_id,
    title,
    message,
    category,
    related_entity_id
  ) values (
    updated.resident_id,
    notification_title,
    notification_message,
    'appointment',
    updated.id
  );

  insert into public.audit_logs (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    p_new_status,
    'appointment',
    updated.id,
    jsonb_build_object(
      'previous_status', p_expected_status,
      'status', p_new_status,
      'notes', coalesce(clean_notes, '')
    )
  );

  return jsonb_build_object('updated', true, 'appointment', to_jsonb(updated));
end;
$function$;

revoke all on function public.transition_appointment(uuid, text, text, text)
  from public, anon;
grant execute on function public.transition_appointment(uuid, text, text, text)
  to authenticated;

create or replace function public.mark_resident_notifications_read(
  p_notification_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  affected_rows integer;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  update public.notifications notification
  set is_read = true
  where notification.is_read = false
    and notification.id = any(coalesce(p_notification_ids, array[]::uuid[]))
    and exists (
      select 1
      from public.residents resident
      where resident.id = notification.resident_id
        and resident.user_id = actor_id
    );

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$function$;

revoke all on function public.mark_resident_notifications_read(uuid[])
  from public, anon;
grant execute on function public.mark_resident_notifications_read(uuid[])
  to authenticated;

commit;

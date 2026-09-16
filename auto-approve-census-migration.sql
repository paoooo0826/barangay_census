begin;

set local lock_timeout = '5s';

alter table public.residents alter column status set default 'verified';

create or replace function public.protect_resident_review_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  actor_is_admin boolean := actor_id is not null and public.is_active_admin();
begin
  if tg_op = 'INSERT' then
    if not actor_is_admin then
      if actor_id is not null then
        new.user_id := actor_id;
      end if;
      new.status := 'verified';
      new.submitted_at := now();
      new.created_at := now();
    end if;
    if new.status not in ('verified', 'rejected') then
      raise exception 'New census records must be approved or rejected'
        using errcode = '22023';
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
      raise exception 'Census records can only be approved or rejected'
        using errcode = '22023';
    end if;
    new.verified_at := case when new.status = 'verified' then now() else null end;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

drop policy if exists "Residents insert own pending census" on public.residents;
drop policy if exists "Residents insert own approved census" on public.residents;
create policy "Residents insert own approved census"
  on public.residents for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'verified');

drop policy if exists "Residents resubmit own census" on public.residents;
drop policy if exists "Residents update own census" on public.residents;
create policy "Residents update own census"
  on public.residents for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.review_resident(
  p_resident_id uuid,
  p_action text,
  p_remark text
)
returns jsonb
language plpgsql
security invoker
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

  select id into current_admin_id from public.admin_profiles
  where user_id = auth.uid() and is_active = true
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
    auth.uid(), p_action, 'resident', p_resident_id,
    jsonb_build_object('status', new_status, 'remark', coalesce(clean_remark, ''))
  );

  return jsonb_build_object('resident_id', p_resident_id, 'status', new_status);
end;
$function$;

revoke all on function public.review_resident(uuid, text, text) from public, anon;
grant execute on function public.review_resident(uuid, text, text) to authenticated;

commit;

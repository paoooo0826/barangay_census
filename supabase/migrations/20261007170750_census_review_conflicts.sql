set local lock_timeout = '5s';
set local statement_timeout = '30s';
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

  new.updated_at := case when tg_op = 'UPDATE'
    then greatest(clock_timestamp(), old.updated_at + interval '1 microsecond')
    else clock_timestamp() end;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.review_resident(p_resident_id uuid, p_action text, p_remark text, p_expected_updated_at timestamptz)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  new_status text;
  current_admin_id uuid;
  saved_updated_at timestamptz;
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

  if p_expected_updated_at is null then
    raise exception 'Refresh the record before reviewing it' using errcode = '40001';
  end if;

  new_status := case when p_action = 'approve' then 'verified' else 'rejected' end;

  update public.residents
  set status = new_status,
      verified_at = case when p_action = 'approve' then now() else null end,
      updated_at = clock_timestamp()
  where id = p_resident_id and updated_at = p_expected_updated_at
  returning updated_at into saved_updated_at;

  if not found then
    if exists(select 1 from public.residents where id = p_resident_id) then
      raise exception 'This record changed in another session. Refresh and review it again.' using errcode = '40001';
    end if;
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

  return jsonb_build_object('resident_id', p_resident_id, 'status', new_status, 'updated_at', saved_updated_at);
end;
$function$;

create or replace function public.review_resident(p_resident_id uuid, p_action text, p_remark text)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
begin
  if auth.uid() is null or not public.is_active_admin() then
    raise exception 'Active administrator access required' using errcode = '42501';
  end if;
  raise exception 'This review page is outdated. Refresh it before approving or rejecting.' using errcode = '40001';
end;
$function$;
revoke all on function public.review_resident(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.review_resident(uuid,text,text,timestamptz) to authenticated;
revoke all on function public.review_resident(uuid,text,text) from public,anon;
grant execute on function public.review_resident(uuid,text,text) to authenticated;
notify pgrst, 'reload schema';

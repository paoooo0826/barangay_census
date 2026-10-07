begin;

create table public.census_drafts (
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('create','update')),
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=50000),
  revision bigint not null check (revision>0),
  base_resident_updated_at timestamptz,
  saved_at timestamptz not null default clock_timestamp(),
  primary key (user_id,mode)
);
alter table public.census_drafts enable row level security;
create policy census_draft_owner_read on public.census_drafts for select to authenticated using (user_id=auth.uid());
revoke all on public.census_drafts from anon, authenticated;
grant select on public.census_drafts to authenticated;

create function private.save_census_draft(p_mode text,p_payload jsonb,p_expected_revision bigint,p_base_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_revision bigint; resident_version timestamptz; clean jsonb;
begin
  if actor is null then raise exception 'Sign in to save your draft.' using errcode='42501'; end if;
  if p_mode is null or p_mode not in ('create','update') or p_expected_revision is null or p_expected_revision<0
     or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>50000 then
    raise exception 'Invalid census draft.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  select updated_at into resident_version from public.residents where user_id=actor;
  if (p_mode='create' and resident_version is not null) or (p_mode='update' and (resident_version is null or p_base_updated_at is distinct from resident_version)) then
    raise exception 'Your census record changed. Reload it before saving another draft.' using errcode='40001';
  end if;
  select revision into current_revision from public.census_drafts where user_id=actor and mode=p_mode for update;
  if coalesce(current_revision,0)<>p_expected_revision then
    raise exception 'This draft changed in another window. Reload to recover the latest saved draft.' using errcode='40001';
  end if;
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into clean from jsonb_each(p_payload)
  where key=any(array['region','province','city_municipality','barangay','last_name','suffix','first_name','middle_name','birth_date','birth_place','sex','civil_status','religion','residential_address','citizenship','profession_occupation','contact_number','highest_education','education_status','residence_start_date','residence_classification','tenurial_status','monthly_rent','boarding_status','boarding_house_name','boarding_house_address','boarding_landlord_name','boarding_start_date','boarding_tenant_count','boarding_contact','categories','indigenous_group','other_description'])
    and ((key<>'categories' and jsonb_typeof(value)='string') or (key='categories' and jsonb_typeof(value)='array'));
  insert into public.census_drafts(user_id,mode,payload,revision,base_resident_updated_at)
  values(actor,p_mode,clean,coalesce(current_revision,0)+1,case when p_mode='update' then resident_version end)
  on conflict(user_id,mode) do update set payload=excluded.payload,revision=excluded.revision,base_resident_updated_at=excluded.base_resident_updated_at,saved_at=clock_timestamp();
  return (select to_jsonb(d) from public.census_drafts d where user_id=actor and mode=p_mode);
end $$;
create function public.save_census_draft(p_mode text,p_payload jsonb,p_expected_revision bigint,p_base_updated_at timestamptz default null)
returns jsonb language sql set search_path='' as $$select private.save_census_draft(p_mode,p_payload,p_expected_revision,p_base_updated_at)$$;

create function private.delete_census_draft(p_mode text,p_expected_revision bigint)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); version bigint;
begin
  if actor is null then raise exception 'Sign in to manage your draft.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  select revision into version from public.census_drafts where user_id=actor and mode=p_mode for update;
  if version is not null and version is distinct from p_expected_revision then raise exception 'This draft changed in another window. Reload first.' using errcode='40001'; end if;
  delete from public.census_drafts where user_id=actor and mode=p_mode;
end $$;
create function public.delete_census_draft(p_mode text,p_expected_revision bigint)
returns void language sql set search_path='' as $$select private.delete_census_draft(p_mode,p_expected_revision)$$;

create function private.save_census_and_clear_draft(p_resident jsonb,p_categories jsonb,p_government_id jsonb,p_face_verification jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb; target_id uuid; before_categories jsonb; after_categories jsonb; changes jsonb:='{}'; before_id public.government_ids; after_id public.government_ids; before_face text; after_face text;
begin
  if actor is null then raise exception 'Sign in before submitting your census.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  select id into target_id from public.residents where user_id=actor;
  if target_id is not null then
    select coalesce(jsonb_agg(c.name order by c.id),'[]') into before_categories from public.resident_categories rc join public.categories c on c.id=rc.category_id where rc.resident_id=target_id;
    select * into before_id from public.government_ids where resident_id=target_id;
    select captured_face_url into before_face from public.face_verifications where resident_id=target_id;
  end if;
  result:=private.save_resident_census(p_resident,p_categories,p_government_id,p_face_verification);
  if target_id is not null then
    select coalesce(jsonb_agg(c.name order by c.id),'[]') into after_categories from public.resident_categories rc join public.categories c on c.id=rc.category_id where rc.resident_id=target_id;
    select * into after_id from public.government_ids where resident_id=target_id;
    select captured_face_url into after_face from public.face_verifications where resident_id=target_id;
    if before_categories is distinct from after_categories then changes:=changes||jsonb_build_object('categories',jsonb_build_object('before',before_categories,'after',after_categories)); end if;
    if before_id.front_image_url is distinct from after_id.front_image_url or before_id.back_image_url is distinct from after_id.back_image_url or before_id.id_type is distinct from after_id.id_type then
      changes:=changes||jsonb_build_object('id_document',jsonb_build_object('before',coalesce(before_id.id_type,'Not provided'),'after',coalesce(after_id.id_type,'Updated images'))); end if;
    if before_face is distinct from after_face then changes:=changes||jsonb_build_object('live_photo',jsonb_build_object('before',case when before_face is null then 'Not provided' else 'Previous image' end,'after','Updated image')); end if;
    if changes<>'{}' then insert into public.audit_logs(user_id,action,entity_type,entity_id,details) values(actor,'census_details_updated','resident',target_id,jsonb_build_object('changes',changes)); end if;
  end if;
  delete from public.census_drafts where user_id=actor;
  return result;
end $$;
create or replace function public.save_resident_census(p_resident jsonb,p_categories jsonb default '[]'::jsonb,p_government_id jsonb default null,p_face_verification jsonb default null)
returns jsonb language sql set search_path='' as $$ select private.save_census_and_clear_draft(p_resident,p_categories,p_government_id,p_face_verification) $$;

create table public.service_payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id),
  amount numeric(12,2) not null check(amount>0),
  fee_at_collection numeric(12,2) not null check(fee_at_collection=amount),
  receipt_number text not null check(length(trim(receipt_number)) between 1 and 80),
  cashier_user_id uuid not null references auth.users(id),
  cashier_name text not null,
  method text not null default 'cash' check(method='cash'),
  status text not null default 'posted' check(status in ('posted','voided')),
  paid_at timestamptz not null default clock_timestamp(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text,
  request_key uuid not null unique,
  check((status='posted' and voided_at is null and voided_by is null and void_reason is null) or
        (status='voided' and voided_at is not null and voided_by is not null and length(trim(void_reason)) between 3 and 1000))
);
create unique index service_payment_receipt_unique on public.service_payments(lower(trim(receipt_number)));
create unique index service_payment_one_posted on public.service_payments(appointment_id) where status='posted';
create index service_payment_appointment on public.service_payments(appointment_id,paid_at desc);
create index service_payment_date on public.service_payments(paid_at desc,id);
create index service_payment_cashier on public.service_payments(cashier_user_id);
create index service_payment_voided_by on public.service_payments(voided_by) where voided_by is not null;
alter table public.service_payments enable row level security;
create policy service_payment_read on public.service_payments for select to authenticated using (
  public.is_active_admin() or exists(select 1 from public.appointments a where a.id=appointment_id and a.user_id=(select auth.uid()))
);
revoke all on public.service_payments from anon,authenticated;
grant select on public.service_payments to authenticated;

create function private.record_service_payment(p_appointment_id uuid,p_amount numeric,p_receipt_number text,p_expected_fee numeric,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments; saved public.service_payments; actor uuid:=auth.uid(); cashier text;
begin
  if actor is null or not public.is_active_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
  if p_request_key is null or p_amount is null or p_amount<=0 or p_expected_fee is null or p_receipt_number is null or length(trim(p_receipt_number)) not between 1 and 80 then
    raise exception 'Enter the amount collected and an official receipt number.' using errcode='22023';
  end if;
  select * into a from public.appointments where id=p_appointment_id for update;
  if not found then raise exception 'Appointment not found.' using errcode='P0002'; end if;
  select * into saved from public.service_payments where request_key=p_request_key;
  if found then
    if saved.appointment_id<>p_appointment_id or saved.amount<>p_amount or lower(saved.receipt_number)<>lower(trim(p_receipt_number)) or saved.cashier_user_id<>actor then
      raise exception 'Payment retry does not match the original request.' using errcode='22023'; end if;
    return to_jsonb(saved);
  end if;
  if a.status in ('cancelled','rejected') then raise exception 'Payments cannot be collected for cancelled or rejected requests.' using errcode='22023'; end if;
  if coalesce(a.fee,0)=0 then raise exception 'This request is free. No collection is required.' using errcode='22023'; end if;
  if a.fee<>p_expected_fee or a.fee<>p_amount then raise exception 'The collection must match the saved appointment fee. Reload the request.' using errcode='40001'; end if;
  if exists(select 1 from public.service_payments where appointment_id=a.id and status='posted') then
    raise exception 'This request already has a recorded payment.' using errcode='23505'; end if;
  select full_name into cashier from public.admin_profiles where user_id=actor and coalesce(is_active,true) limit 1;
  insert into public.service_payments(appointment_id,amount,fee_at_collection,receipt_number,cashier_user_id,cashier_name,request_key)
  values(a.id,p_amount,a.fee,trim(p_receipt_number),actor,cashier,p_request_key) returning * into saved;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,details)
  values(actor,'payment_recorded','appointment',a.id,jsonb_build_object('payment_id',saved.id,'amount',saved.amount,'receipt_number',saved.receipt_number,'actor_name',cashier));
  return to_jsonb(saved);
end $$;
create function public.record_service_payment(p_appointment_id uuid,p_amount numeric,p_receipt_number text,p_expected_fee numeric,p_request_key uuid)
returns jsonb language sql set search_path='' as $$ select private.record_service_payment(p_appointment_id,p_amount,p_receipt_number,p_expected_fee,p_request_key) $$;

create function private.void_service_payment(p_payment_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.service_payments; actor uuid:=auth.uid();
begin
  if actor is null or not public.is_active_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'Enter a reason for voiding the payment record.' using errcode='22023'; end if;
  update public.service_payments set status='voided',void_reason=trim(p_reason),voided_at=clock_timestamp(),voided_by=actor where id=p_payment_id and status='posted' returning * into saved;
  if not found then raise exception 'Payment record changed. Reload before correcting it.' using errcode='40001'; end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,details)
  values(actor,'payment_voided','appointment',saved.appointment_id,jsonb_build_object('payment_id',saved.id,'reason',saved.void_reason,'receipt_number',saved.receipt_number));
  return to_jsonb(saved);
end $$;
create function public.void_service_payment(p_payment_id uuid,p_reason text)
returns jsonb language sql set search_path='' as $$ select private.void_service_payment(p_payment_id,p_reason) $$;

create view public.admin_payment_records with(security_invoker=true) as
select p.*, a.service_type,a.service_purpose,a.appointment_date,a.status as appointment_status,
concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix) as resident_name,
concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix,p.receipt_number,p.cashier_name) as search_text
from public.service_payments p join public.appointments a on a.id=p.appointment_id join public.residents r on r.id=a.resident_id
where public.is_active_admin();
grant select on public.admin_payment_records to authenticated;

create function private.admin_daily_collections(p_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare start_at timestamptz:=p_date::timestamp at time zone 'Asia/Manila'; end_at timestamptz:=(p_date+1)::timestamp at time zone 'Asia/Manila';
begin
  if auth.uid() is null or not public.is_active_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
  if p_date is null then raise exception 'Choose a collection date.' using errcode='22023'; end if;
  return (select jsonb_build_object('date',p_date,'collected',coalesce(sum(amount) filter(where status='posted'),0),'paid_requests',count(*) filter(where status='posted'),'voided_records',count(*) filter(where status='voided'),
    'free_requests',(select count(*) from public.appointments where fee=0 and created_at>=start_at and created_at<end_at))
    from public.service_payments where paid_at>=start_at and paid_at<end_at);
end $$;
create function public.admin_daily_collections(p_date date)
returns jsonb language sql stable set search_path='' as $$select private.admin_daily_collections(p_date)$$;

create function private.audit_resident_information()
returns trigger language plpgsql security definer set search_path='' as $$
declare changes jsonb; actor_name text; old_fields jsonb; new_fields jsonb;
begin
  new_fields:=to_jsonb(new)-array['id','user_id','status','verified_at','updated_at','created_at','registered_at','tracking_number','philsys_number','vocational_course','household_photo_url'];
  if tg_op='UPDATE' then old_fields:=to_jsonb(old)-array['id','user_id','status','verified_at','updated_at','created_at','registered_at','tracking_number','philsys_number','vocational_course','household_photo_url']; else old_fields:='{}'; end if;
  select coalesce(jsonb_object_agg(key,jsonb_build_object('before',old_fields->key,'after',value)),'{}') into changes
    from jsonb_each(new_fields) where value is distinct from old_fields->key;
  if tg_op='UPDATE' and old.household_photo_url is distinct from new.household_photo_url then changes:=changes||jsonb_build_object('household_photo',jsonb_build_object('before',case when old.household_photo_url is null then 'Not provided' else 'Previous image' end,'after',case when new.household_photo_url is null then 'Removed' else 'Updated image' end)); end if;
  if tg_op='UPDATE' and changes='{}' then return new; end if;
  select full_name into actor_name from public.admin_profiles where user_id=auth.uid() and coalesce(is_active,true) limit 1;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,details)
  values(auth.uid(),case when tg_op='INSERT' then 'census_submitted' else 'census_updated' end,'resident',new.id,
    jsonb_build_object('changes',changes,'actor_name',coalesce(actor_name,case when auth.uid()=new.user_id then concat_ws(' ',new.first_name,new.last_name) else 'System' end)));
  return new;
end $$;
create trigger audit_resident_information after insert or update on public.residents for each row execute function private.audit_resident_information();
create index if not exists audit_resident_history_index on public.audit_logs(entity_type,entity_id,created_at desc,id);
create view public.admin_resident_history with(security_invoker=true) as
select l.id,l.entity_id as resident_id,l.action,l.details,l.created_at,
coalesce(nullif(l.details->>'actor_name',''),p.full_name,case when l.user_id=r.user_id then concat_ws(' ',r.first_name,r.last_name) when l.user_id is null then 'System' else 'Administrator' end) as actor_name
from public.audit_logs l left join public.admin_profiles p on p.user_id=l.user_id left join public.residents r on r.id=l.entity_id
where l.entity_type='resident' and public.is_active_admin();
grant select on public.admin_resident_history to authenticated;
revoke insert,update,delete on public.audit_logs from anon,authenticated;

-- Public wrappers use private implementations with an explicit authenticated role.
revoke all on function private.save_census_draft(text,jsonb,bigint,timestamptz),private.delete_census_draft(text,bigint),private.save_census_and_clear_draft(jsonb,jsonb,jsonb,jsonb),private.record_service_payment(uuid,numeric,text,numeric,uuid),private.void_service_payment(uuid,text),private.admin_daily_collections(date),private.audit_resident_information() from public,anon;
grant execute on function private.save_census_draft(text,jsonb,bigint,timestamptz),private.delete_census_draft(text,bigint),private.save_census_and_clear_draft(jsonb,jsonb,jsonb,jsonb),private.record_service_payment(uuid,numeric,text,numeric,uuid),private.void_service_payment(uuid,text),private.admin_daily_collections(date) to authenticated;
revoke all on function public.save_census_draft(text,jsonb,bigint,timestamptz),public.delete_census_draft(text,bigint),public.record_service_payment(uuid,numeric,text,numeric,uuid),public.void_service_payment(uuid,text),public.admin_daily_collections(date) from public,anon;
grant execute on function public.save_census_draft(text,jsonb,bigint,timestamptz),public.delete_census_draft(text,bigint),public.record_service_payment(uuid,numeric,text,numeric,uuid),public.void_service_payment(uuid,text),public.admin_daily_collections(date) to authenticated;
notify pgrst,'reload schema';
commit;

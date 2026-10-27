-- Staged source; combined into a versioned migration only after rollback tests.
create table public.admin_notifications (
 id uuid primary key default gen_random_uuid(),
 event_key text not null unique,
 category text not null check(category in ('census','appointment','incident','feedback','landlord_message')),
 entity_id uuid not null,
 title text not null,
 message text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index admin_notifications_newest on public.admin_notifications(created_at desc,id desc);
create table public.admin_notification_reads (
 notification_id uuid not null references public.admin_notifications(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 read_at timestamptz not null default clock_timestamp(),
 primary key(notification_id,user_id)
);
alter table public.admin_notifications enable row level security;
alter table public.admin_notification_reads enable row level security;
create policy admin_event_read on public.admin_notifications for select to authenticated using ((select public.is_active_admin()));
create policy admin_event_receipt_read on public.admin_notification_reads for select to authenticated using (user_id=(select auth.uid()) and (select public.is_active_admin()));
revoke all on public.admin_notifications,public.admin_notification_reads from anon,authenticated;
grant select on public.admin_notifications,public.admin_notification_reads to authenticated;

alter table public.notifications add column event_key text;
create unique index notification_event_unique on public.notifications(event_key) where event_key is not null;
alter table public.notifications drop constraint notifications_category_check;
alter table public.notifications add constraint notifications_category_check check(category in ('census','appointment','system','feedback','incident','message'));

create function private.brims_admin_event(p_key text,p_category text,p_entity uuid,p_title text,p_message text)
returns void language sql security definer set search_path='' as $$
 insert into public.admin_notifications(event_key,category,entity_id,title,message)
 values(p_key,p_category,p_entity,p_title,p_message) on conflict(event_key) do nothing;
$$;
revoke all on function private.brims_admin_event(text,text,uuid,text,text) from public,anon,authenticated;
create function private.brims_resident_event(p_key text,p_resident uuid,p_category text,p_entity uuid,p_title text,p_message text)
returns void language sql security definer set search_path='' as $$
 insert into public.notifications(event_key,resident_id,category,related_entity_id,title,message,is_read)
 values(p_key,p_resident,p_category,p_entity,p_title,p_message,false) on conflict(event_key) where event_key is not null do nothing;
$$;
revoke all on function private.brims_resident_event(text,uuid,text,uuid,text,text) from public,anon,authenticated;

create function private.brims_admin_feed(p_offset integer,p_limit integer,p_unread_only boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
 if actor is null or not public.is_active_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid notification page.' using errcode='22023'; end if;
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from (
   select n.id,n.category,n.entity_id,n.title,n.message,n.created_at,exists(select 1 from public.admin_notification_reads r where r.notification_id=n.id and r.user_id=actor) as is_read
   from public.admin_notifications n where not coalesce(p_unread_only,false) or not exists(select 1 from public.admin_notification_reads r where r.notification_id=n.id and r.user_id=actor)
   order by n.created_at desc,n.id desc limit p_limit offset p_offset) x),'[]'::jsonb),
   'unread_count',(select count(*) from public.admin_notifications n where not exists(select 1 from public.admin_notification_reads r where r.notification_id=n.id and r.user_id=actor)),
   'total',(select count(*) from public.admin_notifications n where not coalesce(p_unread_only,false) or not exists(select 1 from public.admin_notification_reads r where r.notification_id=n.id and r.user_id=actor))) into result;
 return result;
end $$;
create function public.admin_notification_feed(p_offset integer default 0,p_limit integer default 20,p_unread_only boolean default false)
returns jsonb language sql security invoker set search_path='' as $$select private.brims_admin_feed(p_offset,p_limit,p_unread_only)$$;
create function private.brims_mark_admin_notifications(p_ids uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); affected integer;
begin
 if actor is null or not public.is_active_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
 insert into public.admin_notification_reads(notification_id,user_id)
 select id,actor from public.admin_notifications where p_ids is null or id=any(p_ids)
 on conflict do nothing;
 get diagnostics affected=row_count; return affected;
end $$;
create function public.mark_admin_notifications_read(p_notification_ids uuid[] default null)
returns integer language sql security invoker set search_path='' as $$select private.brims_mark_admin_notifications(p_notification_ids)$$;

create function private.brims_resident_feed(p_resident uuid,p_offset integer,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.residents where id=p_resident and user_id=auth.uid()) then raise exception 'Own resident record required.' using errcode='42501'; end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid notification page.' using errcode='22023'; end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc,id desc) from (
  select id,resident_id,title,message,category,related_entity_id,coalesce(is_read,false) as is_read,created_at from public.notifications where resident_id=p_resident order by created_at desc,id desc limit p_limit offset p_offset) x),'[]'::jsonb),
  'unread_count',(select count(*) from public.notifications where resident_id=p_resident and not coalesce(is_read,false)),
  'total',(select count(*) from public.notifications where resident_id=p_resident));
end $$;
create function public.resident_notification_feed(p_resident_id uuid,p_offset integer default 0,p_limit integer default 50)
returns jsonb language sql security invoker set search_path='' as $$select private.brims_resident_feed(p_resident_id,p_offset,p_limit)$$;
create or replace function public.mark_resident_notifications_read(p_notification_ids uuid[]) returns integer
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
 update public.notifications n set is_read=true where not coalesce(n.is_read,false)
 and (p_notification_ids is null or n.id=any(p_notification_ids)) and exists(select 1 from public.residents r where r.id=n.resident_id and r.user_id=auth.uid());
 get diagnostics affected=row_count; return affected;
end $$;

create function private.brims_census_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or (not public.is_active_admin() and
  (to_jsonb(new)-array['updated_at','verified_at','submitted_at']) is distinct from (to_jsonb(old)-array['updated_at','verified_at','submitted_at'])) then
  perform private.brims_admin_event('census:'||new.id::text||':'||new.updated_at::text,'census',new.id,'Census Submission','A resident census submission is ready for administrator review.');
 end if; return new;
end $$;
create trigger brims_census_notification after insert or update on public.residents for each row execute function private.brims_census_notification();
revoke all on function private.brims_census_notification() from public,anon,authenticated;

revoke all on function public.admin_notification_feed(integer,integer,boolean),public.mark_admin_notifications_read(uuid[]),public.resident_notification_feed(uuid,integer,integer) from public,anon;
revoke all on function private.brims_admin_feed(integer,integer,boolean),private.brims_mark_admin_notifications(uuid[]),private.brims_resident_feed(uuid,integer,integer) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.brims_admin_feed(integer,integer,boolean),private.brims_mark_admin_notifications(uuid[]),private.brims_resident_feed(uuid,integer,integer),public.admin_notification_feed(integer,integer,boolean),public.mark_admin_notifications_read(uuid[]),public.resident_notification_feed(uuid,integer,integer) to authenticated;

alter table public.appointments
 add column completion_receipt_id uuid references public.service_payments(id),
 add column receipt_verified_at timestamptz,
 add column accepted_at timestamptz,
 add column rejected_at timestamptz,
 add column workflow_version integer not null default 0;
create index appointments_receipt_link on public.appointments(completion_receipt_id) where completion_receipt_id is not null;
alter table public.service_payments drop constraint service_payments_amount_check;
alter table public.service_payments drop constraint service_payments_method_check;
alter table public.service_payments add constraint service_payments_amount_check check(amount>=0 and amount::text not in ('NaN','Infinity','-Infinity'));
alter table public.service_payments add constraint service_payments_method_check check((method='cash' and amount>0) or (method='zero_fee_acknowledgment' and amount=0));

create function private.brims_receipt_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare valid_receipt boolean; admin boolean:=auth.uid() is not null and public.is_active_admin();
begin
 if tg_op='INSERT' then
  new.workflow_version:=0;
  if new.status<>'pending' and not admin then raise exception 'New requests must be Pending.' using errcode='42501'; end if;
 else
  new.accepted_at:=old.accepted_at; new.rejected_at:=old.rejected_at;
  new.workflow_version:=old.workflow_version+case when new.status is distinct from old.status then 1 else 0 end;
  if new.status is distinct from old.status and not (
   (old.status='pending' and new.status in ('confirmed','rejected','cancelled')) or
   (old.status='confirmed' and new.status in ('completed','rejected','cancelled')) or
   (old.status='completed' and new.status='confirmed' and old.completion_receipt_id is not null and not exists(select 1 from public.service_payments where id=old.completion_receipt_id and status='posted'))
  ) then raise exception 'Invalid appointment status transition.' using errcode='22023'; end if;
  if old.status='completed' and old.completion_receipt_id is not null and new.status='completed' and new.completion_receipt_id is distinct from old.completion_receipt_id then
   raise exception 'Void the previous receipt before issuing a correction.' using errcode='22023';
  end if;
 end if;
 if new.status='confirmed' and (tg_op='INSERT' or old.status is distinct from new.status) then new.accepted_at:=clock_timestamp(); end if;
 if new.status='rejected' and (tg_op='INSERT' or old.status is distinct from new.status) then
  if nullif(trim(new.admin_notes),'') is null then raise exception 'A rejection reason is required.' using errcode='22023'; end if;
  new.rejected_at:=clock_timestamp();
 end if;
 if new.status='cancelled' and (tg_op='INSERT' or old.status is distinct from new.status) then
  if length(trim(coalesce(new.cancellation_reason,''))) not between 3 and 500 then raise exception 'A cancellation reason is required.' using errcode='22023'; end if;
  new.cancelled_at:=clock_timestamp();
 end if;
 if new.status='completed' and (tg_op='INSERT' or old.status<>'completed' or new.completion_receipt_id is distinct from old.completion_receipt_id) then
  if not admin then raise exception 'Active administrator access required.' using errcode='42501'; end if;
  select exists(select 1 from public.service_payments p where p.id=new.completion_receipt_id and p.appointment_id=new.id and p.status='posted'
   and p.amount=new.fee and p.fee_at_collection=new.fee and ((new.fee>0 and p.method='cash') or (new.fee=0 and p.method='zero_fee_acknowledgment'))) into valid_receipt;
  if not valid_receipt then raise exception 'Completion requires a valid receipt linked to this appointment and its saved fee.' using errcode='23514'; end if;
  new.receipt_verified_at:=clock_timestamp();
  new.completed_at:=case when tg_op='UPDATE' and old.status='completed' then old.completed_at else clock_timestamp() end;
 elsif new.status='completed' then
  new.completed_at:=old.completed_at; new.receipt_verified_at:=old.receipt_verified_at;
 elsif new.status<>'completed' then
  new.completion_receipt_id:=null; new.receipt_verified_at:=null; new.completed_at:=null;
 end if;
 return new;
end $$;
revoke all on function private.brims_receipt_guard() from public,anon,authenticated;
create trigger brims_receipt_guard before insert or update on public.appointments for each row execute function private.brims_receipt_guard();

create function private.brims_appointment_event() returns trigger language plpgsql security definer set search_path='' as $$
declare title text; message text; key text;
begin
 key:='appointment:'||new.id::text||':'||new.workflow_version::text;
 if tg_op='INSERT' then
  perform private.brims_admin_event(key,'appointment',new.id,'New Appointment Request','A resident submitted a service appointment request.');
 elsif new.status is distinct from old.status or (new.status='completed' and new.completion_receipt_id is distinct from old.completion_receipt_id) then
  title:=case new.status when 'confirmed' then case when old.status='completed' then 'Receipt Voided — Appointment Reopened' else 'Appointment Accepted' end when 'completed' then 'Appointment Completed' when 'rejected' then 'Appointment Rejected' else 'Appointment Cancelled' end;
  message:=case new.status when 'confirmed' then case when old.status='completed' then 'The previous receipt was voided. The appointment is Accepted and awaits a corrected receipt.' else 'Your appointment was accepted and awaits service and receipt processing.' end
   when 'completed' then 'The service receipt or zero-fee release acknowledgment has been recorded. Your appointment is completed.'
   when 'rejected' then 'Your appointment was rejected. Reason: '||coalesce(new.admin_notes,'')
   else 'Your appointment was cancelled. Reason: '||coalesce(new.cancellation_reason,'') end;
  perform private.brims_resident_event(key,new.resident_id,'appointment',new.id,title,message);
  if new.status='cancelled' and not public.is_active_admin() then perform private.brims_admin_event(key,'appointment',new.id,'Appointment Cancelled','A resident cancelled an appointment.'); end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,details) values(auth.uid(),new.status,'appointment',new.id,
   jsonb_build_object('previous_status',old.status,'status',new.status,'notes',new.admin_notes,'receipt_id',new.completion_receipt_id,'previous_completed_at',old.completed_at));
 end if; return new;
end $$;
revoke all on function private.brims_appointment_event() from public,anon,authenticated;
create trigger brims_appointment_event after insert or update on public.appointments for each row execute function private.brims_appointment_event();

create or replace function private.record_service_payment(p_appointment_id uuid,p_amount numeric,p_receipt_number text,p_expected_fee numeric,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments; saved public.service_payments; actor uuid:=auth.uid(); cashier text;
begin
 if actor is null or not public.is_active_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
 if p_request_key is null or p_amount is null or p_amount<0 or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<>round(p_amount,2) or p_expected_fee is null or length(trim(coalesce(p_receipt_number,''))) not between 1 and 80 then
  raise exception 'Enter the saved fee and a valid receipt or release reference.' using errcode='22023'; end if;
 select * into a from public.appointments where id=p_appointment_id for update;
 if not found then raise exception 'Appointment not found.' using errcode='P0002'; end if;
 select * into saved from public.service_payments where request_key=p_request_key;
 if found then
  if saved.appointment_id<>a.id or saved.amount<>p_amount or lower(trim(saved.receipt_number))<>lower(trim(p_receipt_number)) or saved.cashier_user_id<>actor or saved.fee_at_collection<>p_expected_fee then
   raise exception 'Receipt retry does not match the original request.' using errcode='22023'; end if;
  if saved.status='voided' then raise exception 'The original receipt was voided. Use a new reference for its correction.' using errcode='22023'; end if;
  return to_jsonb(saved);
 end if;
 if a.status<>'confirmed' and not(a.status='completed' and a.completion_receipt_id is null) then raise exception 'Accept this appointment before issuing its receipt.' using errcode='22023'; end if;
 if a.fee is null or a.fee<>p_amount or a.fee<>p_expected_fee then raise exception 'The receipt must match the saved appointment fee. Reload the request.' using errcode='40001'; end if;
 if exists(select 1 from public.service_payments where appointment_id=a.id and status='posted') then raise exception 'A posted receipt already exists. Complete using it or void it before correcting.' using errcode='23505'; end if;
 select full_name into cashier from public.admin_profiles where user_id=actor and is_active limit 1;
 insert into public.service_payments(appointment_id,amount,fee_at_collection,receipt_number,cashier_user_id,cashier_name,request_key,method)
 values(a.id,p_amount,a.fee,trim(p_receipt_number),actor,cashier,p_request_key,case when a.fee=0 then 'zero_fee_acknowledgment' else 'cash' end) returning * into saved;
 update public.appointments set status='completed',completion_receipt_id=saved.id,updated_at=clock_timestamp() where id=a.id;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,details) values(actor,case when a.fee=0 then 'zero_fee_release_recorded' else 'payment_recorded' end,'appointment',a.id,
  jsonb_build_object('payment_id',saved.id,'amount',saved.amount,'receipt_number',saved.receipt_number,'actor_name',cashier,'reconciled_legacy',a.status='completed'));
 return to_jsonb(saved);
end $$;

create or replace function public.transition_appointment(p_appointment_id uuid,p_expected_status text,p_new_status text,p_admin_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments; receipt uuid; notes text:=nullif(trim(p_admin_notes),'');
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
 select * into a from public.appointments where id=p_appointment_id for update;
 if not found or a.status<>p_expected_status then return jsonb_build_object('updated',false,'conflict',true); end if;
 if not((a.status='pending' and p_new_status in ('confirmed','rejected')) or (a.status='confirmed' and p_new_status in ('completed','rejected')) or (a.status='completed' and a.completion_receipt_id is null and p_new_status='completed')) then
  raise exception 'Invalid appointment status transition.' using errcode='22023'; end if;
 if length(coalesce(notes,''))>1000 or (p_new_status='rejected' and notes is null) then raise exception 'Provide a rejection reason of at most 1000 characters.' using errcode='22023'; end if;
 if p_new_status='completed' then
  select id into receipt from public.service_payments p where p.appointment_id=a.id and p.status='posted' and p.amount=a.fee and p.fee_at_collection=a.fee and ((a.fee>0 and p.method='cash') or (a.fee=0 and p.method='zero_fee_acknowledgment'));
  if receipt is null then raise exception 'Record the required receipt or zero-fee acknowledgment before completion.' using errcode='23514'; end if;
 end if;
 update public.appointments set status=p_new_status,admin_notes=notes,completion_receipt_id=receipt,updated_at=clock_timestamp() where id=a.id returning * into a;
 return jsonb_build_object('updated',true,'appointment',to_jsonb(a));
end $$;

create or replace function public.cancel_resident_appointment(p_appointment_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments;
begin
 if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'Enter a cancellation reason with 3 to 500 characters.' using errcode='22023'; end if;
 update public.appointments set status='cancelled',cancellation_reason=trim(p_reason),cancelled_at=clock_timestamp(),updated_at=clock_timestamp()
 where id=p_appointment_id and user_id=auth.uid() and status in ('pending','confirmed') returning * into a;
 return jsonb_build_object('cancelled',a.id is not null,'appointment',to_jsonb(a));
end $$;

create function private.brims_void_reopens() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status='posted' and new.status='voided' then
  update public.appointments set status='confirmed',completion_receipt_id=null,completed_at=null,receipt_verified_at=null,updated_at=clock_timestamp()
  where id=new.appointment_id and status='completed' and completion_receipt_id=new.id;
 end if; return new;
end $$;
revoke all on function private.brims_void_reopens() from public,anon,authenticated;
create trigger brims_void_reopens after update of status on public.service_payments for each row execute function private.brims_void_reopens();
create or replace function private.void_service_payment(p_payment_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.service_payments; actor uuid:=auth.uid(); appointment uuid;
begin
 if actor is null or not public.is_active_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'Enter a reason with 3 to 1000 characters.' using errcode='22023'; end if;
 select appointment_id into appointment from public.service_payments where id=p_payment_id;
 perform 1 from public.appointments where id=appointment for update;
 select * into saved from public.service_payments where id=p_payment_id for update;
 if saved.id is null then raise exception 'Receipt not found.' using errcode='P0002'; end if;
 if saved.status='voided' then
  if saved.voided_by=actor and saved.void_reason=trim(p_reason) then return to_jsonb(saved); end if;
  raise exception 'Receipt already voided. Reload its history.' using errcode='40001';
 end if;
 update public.service_payments set status='voided',void_reason=trim(p_reason),voided_at=clock_timestamp(),voided_by=actor where id=saved.id returning * into saved;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,details) values(actor,'payment_voided','appointment',saved.appointment_id,jsonb_build_object('payment_id',saved.id,'reason',saved.void_reason,'receipt_number',saved.receipt_number));
 return to_jsonb(saved);
end $$;

create view public.resident_appointment_records with(security_invoker=true) as select a.*,
 exists(select 1 from public.service_payments p where p.id=a.completion_receipt_id and p.appointment_id=a.id and p.status='posted' and p.amount=a.fee) as has_valid_receipt,
 a.status='completed' and a.completion_receipt_id is null as legacy_receipt_missing
 from public.appointments a;
grant select on public.resident_appointment_records to authenticated;
do $migration$
declare original text; columns_sql text;
begin
 select pg_get_viewdef('public.admin_service_records'::regclass,true) into original;
 select string_agg(case when attname='status_label' then 'case when base.status=''confirmed'' then ''Accepted'' else base.status_label end as status_label'
  when attname='search_text' then 'concat_ws('' '',base.search_text,case when base.status=''confirmed'' then ''Accepted'' end) as search_text'
  else format('base.%I',attname) end,',' order by attnum) into columns_sql from pg_attribute where attrelid='public.admin_service_records'::regclass and attnum>0 and not attisdropped;
 execute 'create or replace view public.admin_service_records with(security_invoker=true) as select '||columns_sql||', a.completion_receipt_id,a.receipt_verified_at,a.accepted_at,a.rejected_at,a.workflow_version,
 exists(select 1 from public.service_payments p where p.id=a.completion_receipt_id and p.appointment_id=a.id and p.status=''posted'' and p.amount=a.fee) as has_valid_receipt,
 (a.status=''completed'' and a.completion_receipt_id is null) as legacy_receipt_missing
 from ('||rtrim(original,E';\n ')||') base join public.appointments a on a.id=base.id';
end $migration$;

create or replace function private.admin_daily_collections(p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare start_at timestamptz:=p_date::timestamp at time zone 'Asia/Manila'; end_at timestamptz:=(p_date+1)::timestamp at time zone 'Asia/Manila';
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
 if p_date is null then raise exception 'Choose a collection date.' using errcode='22023'; end if;
 return (select jsonb_build_object('date',p_date,'collected',coalesce(sum(amount) filter(where status='posted' and method='cash'),0),'paid_requests',count(*) filter(where status='posted' and method='cash'),
 'voided_records',count(*) filter(where status='voided'),'free_requests',count(*) filter(where status='posted' and method='zero_fee_acknowledgment')) from public.service_payments where paid_at>=start_at and paid_at<end_at);
end $$;

create table public.resident_feedback (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 resident_id uuid not null references public.residents(id), request_key uuid not null,
 kind text not null check(kind in ('comment','suggestion','concern')),
 content text not null check(length(trim(content)) between 10 and 4000),
 status text not null default 'new' check(status in ('new','reviewed','resolved')),
 response text not null default '' check(length(response)<=4000),
 version integer not null default 0,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(user_id,request_key)
);
create table public.incident_reports (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 resident_id uuid not null references public.residents(id), request_key uuid not null,
 tracking_reference text not null unique,
 category text not null check(category in ('safety_concern','disturbance','property_damage','traffic','environmental','other')),
 description text not null check(length(trim(description)) between 20 and 6000),
 location text not null check(length(trim(location)) between 5 and 300), occurred_at timestamptz not null,
 status text not null default 'submitted' check(status in ('submitted','under_review','in_progress','resolved','rejected')),
 response text not null default '' check(length(response)<=4000), version integer not null default 0,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(user_id,request_key)
);
create table public.incident_attachments (
 id uuid primary key default gen_random_uuid(), report_id uuid not null references public.incident_reports(id),
 object_path text not null unique, created_at timestamptz not null default clock_timestamp()
);
create table public.community_case_updates (
 id uuid primary key default gen_random_uuid(),
 feedback_id uuid references public.resident_feedback(id), incident_id uuid references public.incident_reports(id),
 user_id uuid not null references auth.users(id), actor_user_id uuid not null references auth.users(id),
 status text not null, message text not null default '', created_at timestamptz not null default clock_timestamp(),
 check(num_nonnulls(feedback_id,incident_id)=1),
 check((feedback_id is not null and status in ('new','reviewed','resolved')) or (incident_id is not null and status in ('submitted','under_review','in_progress','resolved','rejected')))
);
create index feedback_newest on public.resident_feedback(created_at desc,id desc);
create index feedback_owner on public.resident_feedback(user_id,created_at desc);
create index incidents_newest on public.incident_reports(created_at desc,id desc);
create index incidents_owner on public.incident_reports(user_id,created_at desc);
create index incident_images_parent on public.incident_attachments(report_id);
create index case_feedback_updates on public.community_case_updates(feedback_id,created_at desc);
create index case_incident_updates on public.community_case_updates(incident_id,created_at desc);
alter table public.resident_feedback enable row level security;
alter table public.incident_reports enable row level security;
alter table public.incident_attachments enable row level security;
alter table public.community_case_updates enable row level security;
create policy feedback_read on public.resident_feedback for select to authenticated using (user_id=(select auth.uid()) or (select public.is_active_admin()));
create policy incidents_read on public.incident_reports for select to authenticated using (user_id=(select auth.uid()) or (select public.is_active_admin()));
create policy incident_images_read on public.incident_attachments for select to authenticated using (exists(select 1 from public.incident_reports r where r.id=report_id and (r.user_id=(select auth.uid()) or (select public.is_active_admin()))));
create policy case_updates_read on public.community_case_updates for select to authenticated using (user_id=(select auth.uid()) or (select public.is_active_admin()));
revoke all on public.resident_feedback,public.incident_reports,public.incident_attachments,public.community_case_updates from anon,authenticated;
grant select on public.resident_feedback,public.incident_reports,public.incident_attachments,public.community_case_updates to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('incident-attachments','incident-attachments',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create policy brims_incident_image_upload on storage.objects for insert to authenticated with check (
 bucket_id='incident-attachments' and split_part(name,'/',1)=(select auth.uid())::text
 and split_part(name,'/',2) ~ '^[0-9a-fA-F-]{36}$'
 and exists(select 1 from public.residents where user_id=(select auth.uid()))
);
create policy brims_incident_image_read on storage.objects for select to authenticated using (
 bucket_id='incident-attachments' and (split_part(name,'/',1)=(select auth.uid())::text or
 ((select public.is_active_admin()) and exists(select 1 from public.incident_attachments where object_path=name)))
);
create policy brims_incident_staged_cleanup on storage.objects for delete to authenticated using (
 bucket_id='incident-attachments' and split_part(name,'/',1)=(select auth.uid())::text
 and not exists(select 1 from public.incident_attachments where object_path=name)
);

create function private.brims_submit_feedback(p_kind text,p_content text,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); resident uuid; saved public.resident_feedback;
begin
 if actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
 select id into resident from public.residents where user_id=actor order by updated_at desc nulls last,id limit 1;
 if resident is null then raise exception 'Complete resident registration before sending feedback.' using errcode='42501'; end if;
 if p_request_key is null or p_kind is null or p_kind not in ('comment','suggestion','concern') or length(trim(coalesce(p_content,''))) not between 10 and 4000 then raise exception 'Choose a feedback type and write 10 to 4000 characters.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':feedback:'||p_request_key::text,0));
 select * into saved from public.resident_feedback where user_id=actor and request_key=p_request_key;
 if found then
  if saved.kind<>p_kind or saved.content<>trim(p_content) then raise exception 'Feedback retry does not match the original submission.' using errcode='22023'; end if;
  return to_jsonb(saved);
 end if;
 insert into public.resident_feedback(user_id,resident_id,request_key,kind,content) values(actor,resident,p_request_key,p_kind,trim(p_content)) returning * into saved;
 perform private.brims_admin_event('feedback:'||saved.id::text,'feedback',saved.id,'New Resident Feedback','A resident submitted written feedback for review.');
 insert into public.audit_logs(user_id,action,entity_type,entity_id,details) values(actor,'feedback_submitted','feedback',saved.id,jsonb_build_object('kind',p_kind));
 return to_jsonb(saved);
end $$;
create function public.submit_resident_feedback(p_kind text,p_content text,p_request_key uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.brims_submit_feedback(p_kind,p_content,p_request_key)$$;

create function private.brims_submit_incident(p_category text,p_description text,p_location text,p_occurred_at timestamptz,p_image_paths text[],p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); resident uuid; saved public.incident_reports; path text; paths text[]:=coalesce(p_image_paths,array[]::text[]); existing_paths text[]; new_report_id uuid:=gen_random_uuid();
begin
 if actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
 select id into resident from public.residents where user_id=actor order by updated_at desc nulls last,id limit 1;
 if resident is null then raise exception 'Complete resident registration before reporting an incident.' using errcode='42501'; end if;
 if p_request_key is null or p_category is null or p_category not in ('safety_concern','disturbance','property_damage','traffic','environmental','other')
 or length(trim(coalesce(p_description,''))) not between 20 and 6000 or length(trim(coalesce(p_location,''))) not between 5 and 300
 or p_occurred_at is null or p_occurred_at>clock_timestamp() or p_occurred_at<'1900-01-01'::timestamptz
 or cardinality(paths)>3 or cardinality(paths)<>(select count(distinct x) from unnest(paths) x) then
  raise exception 'Provide a valid category, description, location, past incident date and up to three distinct images.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':incident:'||p_request_key::text,0));
 select * into saved from public.incident_reports where user_id=actor and request_key=p_request_key;
 if found then
  select coalesce(array_agg(a.object_path order by a.object_path),array[]::text[]) into existing_paths from public.incident_attachments a where a.report_id=saved.id;
  if saved.category<>p_category or saved.description<>trim(p_description) or saved.location<>trim(p_location) or saved.occurred_at<>p_occurred_at or existing_paths<>(select coalesce(array_agg(x order by x),array[]::text[]) from unnest(paths) x) then
   raise exception 'Incident retry does not match the original submission.' using errcode='22023'; end if;
  return to_jsonb(saved);
 end if;
 foreach path in array paths loop
  if path not like actor::text||'/'||p_request_key::text||'/%' or not exists(select 1 from storage.objects o where o.bucket_id='incident-attachments' and o.name=path
   and (o.metadata->>'mimetype') in ('image/jpeg','image/png','image/webp') and (o.metadata->>'size')::bigint between 1 and 5242880) then
   raise exception 'An incident image is unavailable or belongs to another submission.' using errcode='42501'; end if;
 end loop;
 insert into public.incident_reports(id,user_id,resident_id,request_key,tracking_reference,category,description,location,occurred_at)
 values(new_report_id,actor,resident,p_request_key,'IR-'||to_char(now() at time zone 'Asia/Manila','YYYYMMDD')||'-'||upper(substr(replace(new_report_id::text,'-',''),1,12)),p_category,trim(p_description),trim(p_location),p_occurred_at) returning * into saved;
 insert into public.incident_attachments(report_id,object_path) select saved.id,x from unnest(paths) x;
 perform private.brims_admin_event('incident:'||saved.id::text,'incident',saved.id,'New Incident Report','A resident submitted an incident report. The account requires administrator review.');
 insert into public.audit_logs(user_id,action,entity_type,entity_id,details) values(actor,'incident_submitted','incident',saved.id,jsonb_build_object('tracking_reference',saved.tracking_reference,'category',p_category));
 return to_jsonb(saved);
end $$;
create function public.submit_incident_report(p_category text,p_description text,p_location text,p_occurred_at timestamptz,p_image_paths text[],p_request_key uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.brims_submit_incident(p_category,p_description,p_location,p_occurred_at,p_image_paths,p_request_key)$$;

create function private.brims_review_case(p_kind text,p_id uuid,p_expected_updated_at timestamptz,p_status text,p_response text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare original jsonb; saved jsonb; clean_response text:=trim(coalesce(p_response,'')); actor uuid:=auth.uid(); resident uuid; owner_id uuid; next_version integer;
begin
 if actor is null or not public.is_active_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
 if p_kind='feedback' then
  select to_jsonb(f) into original from public.resident_feedback f where id=p_id for update;
  if p_status is null or p_status not in ('new','reviewed','resolved') then raise exception 'Invalid feedback status.' using errcode='22023'; end if;
 elsif p_kind='incident' then
  select to_jsonb(i) into original from public.incident_reports i where id=p_id for update;
  if p_status is null or p_status not in ('submitted','under_review','in_progress','resolved','rejected') then raise exception 'Invalid report status.' using errcode='22023'; end if;
  if p_status='rejected' and length(clean_response)<3 then raise exception 'A rejection reason is required.' using errcode='22023'; end if;
 else raise exception 'Invalid case type.' using errcode='22023'; end if;
 if original is null then raise exception 'The item is unavailable.' using errcode='P0002'; end if;
 if length(clean_response)>4000 then raise exception 'Use at most 4000 characters for the resident response.' using errcode='22023'; end if;
 -- An identical retry is safe even if the caller still holds the prior version.
 if original->>'status'=p_status and original->>'response'=clean_response then return original; end if;
 if p_expected_updated_at is null or (original->>'updated_at')::timestamptz<>p_expected_updated_at then raise exception 'This item changed. Reload it before saving.' using errcode='40001'; end if;
 if p_kind='incident' and original->>'status' in ('resolved','rejected') and p_status not in ('under_review',original->>'status') then raise exception 'Reopen a closed report as Under Review before progressing it.' using errcode='22023'; end if;
 resident:=(original->>'resident_id')::uuid; owner_id:=(original->>'user_id')::uuid; next_version:=(original->>'version')::integer+1;
 if p_kind='feedback' then
  update public.resident_feedback f set status=p_status,response=clean_response,version=next_version,updated_at=clock_timestamp() where id=p_id returning to_jsonb(f) into saved;
 else
  update public.incident_reports i set status=p_status,response=clean_response,version=next_version,updated_at=clock_timestamp() where id=p_id returning to_jsonb(i) into saved;
 end if;
 insert into public.community_case_updates(feedback_id,incident_id,user_id,actor_user_id,status,message)
 values(case when p_kind='feedback' then p_id end,case when p_kind='incident' then p_id end,owner_id,actor,p_status,clean_response);
 perform private.brims_resident_event(p_kind||':'||p_id::text||':'||next_version::text,resident,p_kind,p_id,
  case when p_kind='feedback' then 'Feedback Updated' else 'Incident Report Updated' end,
  'Status: '||initcap(replace(p_status,'_',' '))||case when clean_response<>'' then '. '||clean_response else '.' end);
 insert into public.audit_logs(user_id,action,entity_type,entity_id,details) values(actor,p_kind||'_reviewed',p_kind,p_id,jsonb_build_object('previous_status',original->>'status','status',p_status,'response',clean_response));
 return saved;
end $$;
create function public.review_community_case(p_kind text,p_id uuid,p_expected_updated_at timestamptz,p_status text,p_response text)
returns jsonb language sql security invoker set search_path='' as $$select private.brims_review_case(p_kind,p_id,p_expected_updated_at,p_status,p_response)$$;

revoke all on function private.brims_submit_feedback(text,text,uuid),private.brims_submit_incident(text,text,text,timestamptz,text[],uuid),private.brims_review_case(text,uuid,timestamptz,text,text),public.submit_resident_feedback(text,text,uuid),public.submit_incident_report(text,text,text,timestamptz,text[],uuid),public.review_community_case(text,uuid,timestamptz,text,text) from public,anon;
grant execute on function private.brims_submit_feedback(text,text,uuid),private.brims_submit_incident(text,text,text,timestamptz,text[],uuid),private.brims_review_case(text,uuid,timestamptz,text,text),public.submit_resident_feedback(text,text,uuid),public.submit_incident_report(text,text,text,timestamptz,text[],uuid),public.review_community_case(text,uuid,timestamptz,text,text) to authenticated;

-- Retain identified relationships for authorized census work; landlords use aggregates.
drop policy stays_read on public.boarder_stays;
create policy stays_read on public.boarder_stays for select to authenticated using (
 (select public.is_active_admin()) or exists(select 1 from public.residents r where r.id=resident_id and r.user_id=(select auth.uid()) and r.boarding_status='boarder')
);
drop policy occupancy_history_read on public.boarder_occupancy_history;
create policy occupancy_history_read on public.boarder_occupancy_history for select to authenticated using (
 (select public.is_active_admin()) or exists(select 1 from public.residents r where r.id=resident_id and r.user_id=(select auth.uid()) and r.boarding_status='boarder')
);
alter function census_private.manage_boarding(text,jsonb) rename to manage_boarding_identified;
revoke all on function census_private.manage_boarding_identified(text,jsonb) from public,anon,authenticated;
create function census_private.manage_boarding(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Individual stay administration requires active administrator access. Use the count-only boarding tools.' using errcode='42501'; end if;
 return census_private.manage_boarding_identified(p_action,p_payload);
end $$;
revoke all on function census_private.manage_boarding(text,jsonb) from public,anon;
grant execute on function census_private.manage_boarding(text,jsonb) to authenticated;

create function private.brims_house_access(p_house uuid,p_owner_only boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (public.is_active_admin() or census_private.owns_house(p_house) or
 (not p_owner_only and exists(select 1 from public.boarder_stays s join public.residents r on r.id=s.resident_id where s.boarding_house_id=p_house and r.user_id=auth.uid() and r.boarding_status='boarder')));
$$;
revoke all on function private.brims_house_access(uuid,boolean) from public,anon;
grant execute on function private.brims_house_access(uuid,boolean) to authenticated;

create table public.boarding_count_state (
 boarding_house_id uuid primary key references public.boarding_houses(id),
 current_count integer not null check(current_count between 0 and 100000),
 version integer not null default 1, effective_date date not null,
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default clock_timestamp()
);
create table public.boarding_count_events (
 id uuid primary key default gen_random_uuid(), boarding_house_id uuid not null references public.boarding_houses(id),
 actor_user_id uuid not null references auth.users(id), actor_role text not null check(actor_role in ('Administrator','Landlord/Landlady')),
 request_key uuid not null, request_payload jsonb not null,
 action text not null check(action in ('baseline','arrival','departure','correction')),
 quantity integer not null check(quantity between 0 and 100000),
 before_count integer, after_count integer not null check(after_count between 0 and 100000),
 effective_date date not null, recorded_at timestamptz not null default clock_timestamp(),
 unique(actor_user_id,request_key)
);
create index boarding_count_events_house on public.boarding_count_events(boarding_house_id,effective_date desc,recorded_at desc);
alter table public.boarding_count_state enable row level security;
alter table public.boarding_count_events enable row level security;
create policy count_state_read on public.boarding_count_state for select to authenticated using (private.brims_house_access(boarding_house_id,true));
create policy count_events_read on public.boarding_count_events for select to authenticated using (private.brims_house_access(boarding_house_id,true));
revoke all on public.boarding_count_state,public.boarding_count_events from anon,authenticated;
grant select on public.boarding_count_state,public.boarding_count_events to authenticated;

create function private.brims_boarding_summary(p_house uuid,p_from date,p_to date,p_offset integer,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare registered jsonb; reported jsonb; events jsonb; can_manage boolean;
begin
 if not private.brims_house_access(p_house,false) then raise exception 'This boarding house is unavailable to your account.' using errcode='42501'; end if;
 if p_from>p_to or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid date range or history page.' using errcode='22023'; end if;
 can_manage:=private.brims_house_access(p_house,true);
 select jsonb_build_object('current',count(distinct resident_id) filter(where status='staying'),
  'arrivals',count(*) filter(where (p_from is null or move_in_date>=p_from) and (p_to is null or move_in_date<=p_to)),
  'departures',count(*) filter(where departure_date is not null and (p_from is null or departure_date>=p_from) and (p_to is null or departure_date<=p_to)))
 into registered from public.boarder_stays where boarding_house_id=p_house;
 if can_manage then
  select jsonb_build_object('current',(select current_count from public.boarding_count_state where boarding_house_id=p_house),
   'version',coalesce((select version from public.boarding_count_state where boarding_house_id=p_house),0),
   'effective_date',(select effective_date from public.boarding_count_state where boarding_house_id=p_house),
   'arrivals',coalesce(sum(quantity) filter(where action='arrival'),0),'departures',coalesce(sum(quantity) filter(where action='departure'),0),
   'corrections',count(*) filter(where action='correction')) into reported from public.boarding_count_events
   where boarding_house_id=p_house and (p_from is null or effective_date>=p_from) and (p_to is null or effective_date<=p_to);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.recorded_at desc,x.id desc),'[]'::jsonb) into events from (
   select id,action,quantity,before_count,after_count,effective_date,recorded_at,actor_role from public.boarding_count_events
   where boarding_house_id=p_house and (p_from is null or effective_date>=p_from) and (p_to is null or effective_date<=p_to)
   order by recorded_at desc,id desc limit p_limit offset p_offset) x;
 end if;
 return jsonb_build_object('registered',registered,'reported',reported,'can_manage',can_manage,'events',coalesce(events,'[]'::jsonb),
 'history_total',case when can_manage then (select count(*) from public.boarding_count_events where boarding_house_id=p_house and (p_from is null or effective_date>=p_from) and (p_to is null or effective_date<=p_to)) else 0 end);
end $$;
create function public.boarding_count_summary(p_house_id uuid,p_from date default null,p_to date default null,p_offset integer default 0,p_limit integer default 20)
returns jsonb language sql security invoker set search_path='' as $$select private.brims_boarding_summary(p_house_id,p_from,p_to,p_offset,p_limit)$$;

create function private.brims_record_boarding_count(p_house uuid,p_action text,p_quantity integer,p_date date,p_expected_version integer,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); house public.boarding_houses; current_state public.boarding_count_state; saved public.boarding_count_events; payload jsonb; after_value integer;
begin
 if not private.brims_house_access(p_house,true) then raise exception 'Only the assigned landlord/landlady or an active administrator can update these counts.' using errcode='42501'; end if;
 if p_request_key is null or p_action is null or p_action not in ('baseline','arrival','departure','correction') or p_quantity is null or p_quantity not between 0 and 100000 or (p_action in ('arrival','departure') and p_quantity=0)
  or p_date is null or p_date>(now() at time zone 'Asia/Manila')::date or p_date<'1900-01-01'::date or p_expected_version is null then raise exception 'Provide a valid count, action and reporting date.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':count:'||p_request_key::text,0));
 select * into house from public.boarding_houses where id=p_house for update;
 if not house.active then raise exception 'Reopen this boarding house before changing its counts.' using errcode='22023'; end if;
 payload:=jsonb_build_object('house',p_house,'action',p_action,'quantity',p_quantity,'date',p_date,'version',p_expected_version);
 select * into saved from public.boarding_count_events where actor_user_id=actor and request_key=p_request_key;
 if found then if saved.request_payload<>payload then raise exception 'Count retry does not match the original update.' using errcode='22023'; end if; return jsonb_build_object('id',saved.id,'current_count',saved.after_count); end if;
 select * into current_state from public.boarding_count_state where boarding_house_id=p_house for update;
 if coalesce(current_state.version,0)<>p_expected_version then raise exception 'Counts changed. Reload before saving.' using errcode='40001'; end if;
 if (current_state.boarding_house_id is null and p_action<>'baseline') or (current_state.boarding_house_id is not null and p_action='baseline') then raise exception 'Record the initial count once, then use arrivals, departures or corrections.' using errcode='22023'; end if;
 if current_state.effective_date is not null and p_date<current_state.effective_date then raise exception 'Use a date on or after the latest count entry. Historical corrections remain in the audit history.' using errcode='22023'; end if;
 after_value:=case p_action when 'arrival' then current_state.current_count+p_quantity when 'departure' then current_state.current_count-p_quantity else p_quantity end;
 if after_value not between 0 and 100000 then raise exception 'The resulting occupancy cannot be negative or exceed 100000.' using errcode='22023'; end if;
 insert into public.boarding_count_state(boarding_house_id,current_count,version,effective_date,updated_by)
 values(p_house,after_value,1,p_date,actor) on conflict(boarding_house_id) do update set current_count=excluded.current_count,version=boarding_count_state.version+1,effective_date=excluded.effective_date,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 insert into public.boarding_count_events(boarding_house_id,actor_user_id,actor_role,request_key,request_payload,action,quantity,before_count,after_count,effective_date)
 values(p_house,actor,case when public.is_active_admin() then 'Administrator' else 'Landlord/Landlady' end,p_request_key,payload,p_action,p_quantity,current_state.current_count,after_value,p_date) returning * into saved;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,details) values(actor,'boarding_count_'||p_action,'boarding_house',p_house,jsonb_build_object('event_id',saved.id,'before',current_state.current_count,'after',after_value,'effective_date',p_date));
 return jsonb_build_object('id',saved.id,'current_count',after_value);
end $$;
create function public.record_boarding_count(p_house_id uuid,p_action text,p_quantity integer,p_date date,p_expected_version integer,p_request_key uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.brims_record_boarding_count(p_house_id,p_action,p_quantity,p_date,p_expected_version,p_request_key)$$;

create table public.boarding_messages (
 id uuid primary key default gen_random_uuid(), boarding_house_id uuid not null references public.boarding_houses(id),
 sender_user_id uuid not null references auth.users(id), sender_role text not null check(sender_role in ('admin','landlord')),
 body text not null check(length(trim(body)) between 1 and 4000), request_key uuid not null,
 created_at timestamptz not null default clock_timestamp(), unique(sender_user_id,request_key)
);
create index boarding_messages_house on public.boarding_messages(boarding_house_id,created_at desc,id desc);
create table public.boarding_conversation_reads (
 boarding_house_id uuid not null references public.boarding_houses(id), user_id uuid not null references auth.users(id),
 read_at timestamptz not null default clock_timestamp(), primary key(boarding_house_id,user_id)
);
alter table public.boarding_messages enable row level security;
alter table public.boarding_conversation_reads enable row level security;
create policy boarding_message_read on public.boarding_messages for select to authenticated using (private.brims_house_access(boarding_house_id,true));
create policy boarding_message_receipt_read on public.boarding_conversation_reads for select to authenticated using (user_id=(select auth.uid()) and private.brims_house_access(boarding_house_id,true));
revoke all on public.boarding_messages,public.boarding_conversation_reads from anon,authenticated;
grant select on public.boarding_messages,public.boarding_conversation_reads to authenticated;
create function private.brims_send_message(p_house uuid,p_body text,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved public.boarding_messages; house public.boarding_houses;
begin
 if not private.brims_house_access(p_house,true) then raise exception 'This conversation is unavailable to your account.' using errcode='42501'; end if;
 if p_request_key is null or length(trim(coalesce(p_body,''))) not between 1 and 4000 then raise exception 'Write a message with 1 to 4000 characters.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':message:'||p_request_key::text,0));
 select * into saved from public.boarding_messages where sender_user_id=actor and request_key=p_request_key;
 if found then if saved.boarding_house_id<>p_house or saved.body<>trim(p_body) then raise exception 'Message retry does not match the original.' using errcode='22023'; end if; return to_jsonb(saved); end if;
 select * into house from public.boarding_houses where id=p_house;
 insert into public.boarding_messages(boarding_house_id,sender_user_id,sender_role,body,request_key)
 values(p_house,actor,case when public.is_active_admin() then 'admin' else 'landlord' end,trim(p_body),p_request_key) returning * into saved;
 if saved.sender_role='landlord' then perform private.brims_admin_event('message:'||saved.id::text,'landlord_message',p_house,'New Landlord Message','A landlord/landlady sent a message about an assigned boarding house.');
 else perform private.brims_resident_event('message:'||saved.id::text,house.owner_resident_id,'message',p_house,'New Barangay Message','The barangay office sent a message about your assigned boarding house.'); end if;
 return to_jsonb(saved);
end $$;
create function public.send_boarding_message(p_house_id uuid,p_body text,p_request_key uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.brims_send_message(p_house_id,p_body,p_request_key)$$;
create function private.brims_conversations() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.latest_at desc,x.id) from (
  select h.id,h.name,h.owner_name,h.active,coalesce((select max(m.created_at) from public.boarding_messages m where m.boarding_house_id=h.id),h.created_at) as latest_at,
   (select count(*) from public.boarding_messages m where m.boarding_house_id=h.id and m.sender_user_id<>auth.uid() and m.created_at>coalesce((select r.read_at from public.boarding_conversation_reads r where r.boarding_house_id=h.id and r.user_id=auth.uid()),'-infinity'::timestamptz)) as unread_count
  from public.boarding_houses h where private.brims_house_access(h.id,true)) x),'[]'::jsonb);
end $$;
create function public.boarding_conversations() returns jsonb language sql security invoker set search_path='' as $$select private.brims_conversations()$$;
create function private.brims_mark_conversation(p_house uuid,p_through timestamptz) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.brims_house_access(p_house,true) then raise exception 'This conversation is unavailable to your account.' using errcode='42501'; end if;
 if p_through is null or p_through>clock_timestamp() then raise exception 'Invalid message read boundary.' using errcode='22023'; end if;
 insert into public.boarding_conversation_reads(boarding_house_id,user_id,read_at) values(p_house,auth.uid(),p_through) on conflict(boarding_house_id,user_id) do update set read_at=greatest(boarding_conversation_reads.read_at,excluded.read_at);
end $$;
create function public.mark_boarding_conversation_read(p_house_id uuid,p_through timestamptz) returns void language sql security invoker set search_path='' as $$select private.brims_mark_conversation(p_house_id,p_through)$$;

revoke all on function private.brims_boarding_summary(uuid,date,date,integer,integer),private.brims_record_boarding_count(uuid,text,integer,date,integer,uuid),private.brims_send_message(uuid,text,uuid),private.brims_conversations(),private.brims_mark_conversation(uuid,timestamptz),public.boarding_count_summary(uuid,date,date,integer,integer),public.record_boarding_count(uuid,text,integer,date,integer,uuid),public.send_boarding_message(uuid,text,uuid),public.boarding_conversations(),public.mark_boarding_conversation_read(uuid,timestamptz) from public,anon;
grant execute on function private.brims_boarding_summary(uuid,date,date,integer,integer),private.brims_record_boarding_count(uuid,text,integer,date,integer,uuid),private.brims_send_message(uuid,text,uuid),private.brims_conversations(),private.brims_mark_conversation(uuid,timestamptz),public.boarding_count_summary(uuid,date,date,integer,integer),public.record_boarding_count(uuid,text,integer,date,integer,uuid),public.send_boarding_message(uuid,text,uuid),public.boarding_conversations(),public.mark_boarding_conversation_read(uuid,timestamptz) to authenticated;

-- Append a publication timeline without changing existing view columns.
do $migration$
declare original text;
begin
 select pg_get_viewdef('public.admin_announcement_list'::regclass,true) into original;
 execute 'create or replace view public.admin_announcement_list with(security_invoker=true) as select base.*,case when base.is_published then base.published_at else base.created_at end as timeline_sort from ('||rtrim(original,E';\n ')||') base';
end $migration$;

create or replace function public.admin_dashboard_summary(p_mode text default 'all') returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Manila')::date;
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_mode not in ('all','active','recent','accepted','completed','cancelled','rejected','history','services','legacy') then raise exception 'Invalid appointment view.' using errcode='22023'; end if;
 return jsonb_build_object(
 'stats',(select jsonb_build_object('total',count(*),'verified',count(*) filter(where status='verified'),'pending',count(*) filter(where status='pending_review'),'rejected',count(*) filter(where status='rejected')) from public.residents),
 'appointments',(select jsonb_build_object(
 'total',count(*) filter(where p_mode in ('all','recent','services') or (p_mode='active' and status in ('pending','confirmed')) or (p_mode='accepted' and status='confirmed') or (p_mode='completed' and status='completed' and has_valid_receipt) or (p_mode='cancelled' and status='cancelled') or (p_mode='rejected' and status='rejected') or (p_mode='history' and status in ('completed','cancelled','rejected')) or (p_mode='legacy' and legacy_receipt_missing)),
 'today',count(*) filter(where appointment_date=today and status in ('pending','confirmed')),
 'completedToday',count(*) filter(where status='completed' and has_valid_receipt and (receipt_verified_at at time zone 'Asia/Manila')::date=today),
 'pending',count(*) filter(where status='pending'),'accepted',count(*) filter(where status='confirmed'),
 'completed',count(*) filter(where status='completed' and has_valid_receipt),'cancelled',count(*) filter(where status='cancelled'),'rejected',count(*) filter(where status='rejected'),'legacy',count(*) filter(where legacy_receipt_missing)) from public.resident_appointment_records),
 'announcements',(select jsonb_build_object('active',count(*) filter(where not archived),'archived',count(*) filter(where archived),'published',count(*) filter(where not archived and is_published and published_at<=now() and (expires_at is null or expires_at>now()))) from public.announcements),
 'recentResidents',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc nulls last,x.id desc) from (select * from public.admin_resident_records order by updated_at desc nulls last,id desc limit 5) x),'[]'::jsonb));
end $$;
CREATE OR REPLACE FUNCTION public.admin_system_analytics(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_status text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare charts jsonb:='[]'; rows jsonb; d record; condition text; cohort text; result jsonb; insights jsonb; date_expression text;
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Administrator access is required.' using errcode='42501'; end if;
 if p_from>p_to then raise exception 'The start date must precede the end date.' using errcode='22023'; end if;
 if p_status not in ('all','verified','pending_review','returned','rejected') then raise exception 'Invalid resident status.' using errcode='22023'; end if;
 cohort := case when p_status='all' then 'true' else format('status=%L',p_status) end;
 -- Every source and grouping expression below is a fixed internal whitelist.
 for d in select * from (values
 ('Residents','Residents by Registration Status','resident_set','coalesce(nullif(trim(status),''''),''Not specified'')','',false,'residents'),
 ('Demographics','Residents by Age Group','resident_set','case when birth_date is null or birth_date > (now() at time zone ''Asia/Manila'')::date or birth_date < (now() at time zone ''Asia/Manila'')::date - interval ''130 years'' then ''Unknown / invalid'' when extract(year from age((now() at time zone ''Asia/Manila'')::date,birth_date))<18 then ''0–17 years'' when extract(year from age((now() at time zone ''Asia/Manila'')::date,birth_date))<=30 then ''18–30 years'' when extract(year from age((now() at time zone ''Asia/Manila'')::date,birth_date))<60 then ''31–59 years'' else ''60+ years'' end','',false,'residents'),
 ('Demographics','Residents by Sex','resident_set','coalesce(nullif(trim(sex),''''),''Not specified'')','',false,'residents'),
 ('Demographics','Residents by Civil Status','resident_set','coalesce(nullif(trim(civil_status),''''),''Not specified'')','',false,'residents'),
 ('Demographics','Residents by Religion','resident_set','coalesce(nullif(trim(religion),''''),''Not specified'')','',false,'residents'),
 ('Demographics','Residents by Citizenship','resident_set','coalesce(nullif(trim(citizenship),''''),''Not specified'')','',false,'residents'),
 ('Education and Work','Residents by Highest Education','resident_set','coalesce(nullif(trim(highest_education),''''),''Not specified'')','',false,'residents'),
 ('Education and Work','Residents by Education Status','resident_set','coalesce(nullif(trim(education_status),''''),''Not specified'')','',false,'residents'),
 ('Education and Work','Residents by Reported Occupation Group','resident_set','case when nullif(trim(profession_occupation),'''') is null then ''Not specified'' when lower(profession_occupation) ~ ''student|studying'' then ''Student'' when lower(profession_occupation) ~ ''unemployed|none|no occupation'' then ''No reported employment'' when lower(profession_occupation) ~ ''retired|pension'' then ''Retired'' when lower(profession_occupation) ~ ''housewife|homemaker|househusband'' then ''Homemaker'' when lower(profession_occupation) ~ ''self.employed|business|entrepreneur|freelance'' then ''Self employed / business'' else ''Other reported occupation'' end','',false,'residents'),
 ('Housing and Residency','Residents by Housing Arrangement','resident_set','coalesce(nullif(trim(tenurial_status),''''),''Not specified'')','',false,'residents'),
 ('Housing and Residency','Residents by Monthly Rent Range','resident_set','case when monthly_rent is null then ''Not specified'' when monthly_rent=0 then ''₱0'' when monthly_rent<0 then ''Invalid value'' when monthly_rent<3000 then ''₱1–2,999'' when monthly_rent<6000 then ''₱3,000–5,999'' when monthly_rent<10000 then ''₱6,000–9,999'' else ''₱10,000+'' end','',false,'residents'),
 ('Housing and Residency','Household Photo Coverage','resident_set','case when nullif(household_photo_url,'''') is null then ''No photo'' else ''Photo provided'' end','',false,'residents'),
 ('Housing and Residency','Residents by Boarding Role','resident_set','coalesce(nullif(trim(boarding_status),''''),''Not specified'')','',false,'residents'),
 ('Housing and Residency','Registered Residents by Current Residency','residency_set','coalesce(nullif(current_classification,''''),''No current residency period'')','',false,'residency periods'),
 ('Boarders','Boarding Houses by Active Status','public.boarding_houses','case when active then ''Active'' else ''Inactive'' end','',false,'boarding houses'),
 ('Boarders','Boarder Stays by Occupancy Status','public.boarder_stays','coalesce(nullif(status,''''),''Not specified'')','',false,'stays'),
 ('Verification','Residents by ID Verification Status','verification_set','case when government_id is null then ''No ID record'' when id_verified then ''Verified ID'' else ''ID awaiting verification'' end','',false,'residents'),
 ('Verification','Residents by Live Verification Status','verification_set','coalesce(nullif(verification_status,''''),''No live verification record'')','',false,'residents'),
 ('Verification','Live Verification Review Recommendations','verification_set','coalesce(nullif(verification_recommendation,''''),''No recommendation'')','',false,'residents'),
 ('Services and Appointments','Appointments by Status','public.resident_appointment_records','case when status=''confirmed'' then ''Accepted'' when legacy_receipt_missing then ''Legacy completed — receipt missing'' else initcap(status) end','',false,'appointments'),
 ('Services and Appointments','Service Requests by Type','public.appointments','replace(service_type,''_'','' '')','created_at',true,'requests'),
 ('Services and Appointments','Residency Requests by Purpose','public.appointments','coalesce(nullif(replace(service_purpose,''_'','' ''),''''),''Not applicable / legacy'')','created_at',true,'requests'),
 ('Services and Appointments','Appointment Visits by Status','public.resident_appointment_records','case when status=''confirmed'' then ''Accepted'' when legacy_receipt_missing then ''Legacy completed — receipt missing'' else initcap(status) end','appointment_date',true,'appointments'),
 ('Services and Appointments','Service Requests by Saved Fee','public.appointments','case when fee=0 then ''Free'' else ''₱''||trim(trailing ''.'' from trim(trailing ''0'' from to_char(fee,''FM999999999990.00'')))||case when exists(select 1 from public.service_catalog c where fee in (c.base_fee,c.student_fee)) then '''' else '' (Historical)'' end end','created_at',true,'requests'),
 ('Activity','Resident Registrations by Month','resident_set','coalesce(to_char(coalesce(submitted_at,created_at) at time zone ''Asia/Manila'',''YYYY-MM''),''Unknown date'')','coalesce(submitted_at,created_at)',true,'registrations'),
 ('Activity','Resident Verifications by Month','resident_set','coalesce(to_char(verified_at at time zone ''Asia/Manila'',''YYYY-MM''),''Unknown date'')','verified_at',true,'verifications'),
 ('Activity','Service Requests by Month','public.appointments','to_char(created_at at time zone ''Asia/Manila'',''YYYY-MM'')','created_at',true,'requests'),
 ('Activity','Receipt-Backed Completions by Month','public.resident_appointment_records','to_char(receipt_verified_at at time zone ''Asia/Manila'',''YYYY-MM'')','receipt_verified_at',true,'completions'),
 ('Activity','Cancelled Appointments by Month','public.appointments','to_char(cancelled_at at time zone ''Asia/Manila'',''YYYY-MM'')','cancelled_at',true,'cancellations'),
 ('Activity','Boarder Arrivals by Month','public.boarder_stays','to_char(move_in_date,''YYYY-MM'')','move_in_date',true,'arrivals'),
 ('Activity','Boarder Departures by Month','public.boarder_stays','to_char(departure_date,''YYYY-MM'')','departure_date',true,'departures'),
 ('Community Reports','Written Feedback by Status','public.resident_feedback','initcap(status)','created_at',true,'submissions'),
 ('Community Reports','Incident Reports by Review Status','public.incident_reports','initcap(replace(status,''_'','' ''))','created_at',true,'submitted reports'),
 ('Community Reports','Incident Reports by Category','public.incident_reports','initcap(replace(category,''_'','' ''))','created_at',true,'submitted reports'),
 ('Boarders','Landlord-Reported Count Changes','public.boarding_count_events','initcap(action)','effective_date',true,'ledger entries'),
 ('Community Reports','Boarding Messages by Sender Role','public.boarding_messages','initcap(sender_role)','created_at',true,'messages'),
 ('Payments','Payments by Status','public.service_payments','status','paid_at',true,'payments'),
 ('Announcements','Announcements by Publication State','public.announcements','case when archived then ''Archived'' when not is_published then ''Hidden'' when published_at>now() then ''Scheduled'' when expires_at<=now() then ''Expired'' else ''Published'' end','',false,'announcements'),
 ('Announcements','Announcements by Priority','public.announcements','priority','created_at',true,'announcements'),
 ('Announcements','Announcements by Audience','public.announcements','replace(audience,''_'','' '')','created_at',true,'announcements')
 ) v(section,title,source,expression,date_column,period,unit)
 loop
   condition := case when d.source in ('resident_set','verification_set','residency_set') then cohort else 'true' end;
   if d.title='Receipt-Backed Completions by Month' then condition:=condition||' and status=''completed'' and has_valid_receipt'; end if;
   if d.title like 'Cancelled Appointments%' then condition:=condition||' and status=''cancelled'''; end if;
   if d.title='Residency Requests by Purpose' then condition:=condition||' and service_type=''certificate_of_residency'''; end if;
   if d.period then
     date_expression:=case when d.date_column in ('appointment_date','move_in_date','departure_date','effective_date') then format('(%s)::timestamp at time zone ''Asia/Manila''',d.date_column) else format('(%s)::timestamptz',d.date_column) end;
     if p_from is not null then condition:=condition||format(' and (%s) >= %L::date::timestamp at time zone ''Asia/Manila''',date_expression,p_from); end if;
     if p_to is not null then condition:=condition||format(' and (%s) < (%L::date+1)::timestamp at time zone ''Asia/Manila''',date_expression,p_to); end if;
     if d.date_column in ('verified_at','completed_at','cancelled_at','departure_date','receipt_verified_at') then condition:=condition||format(' and %s is not null',d.date_column); end if;
   end if;
   execute format('with resident_set as (select distinct on (coalesce(user_id,id)) * from public.residents order by coalesce(user_id,id),updated_at desc nulls last,id), residency_set as (select r.*,coalesce(c.current_classification,case when exists(select 1 from public.residency_periods p where p.resident_id=r.id and p.end_date is not null) then ''Departed / no current period'' else ''No recorded residency period'' end) as current_classification from resident_set r left join public.residency_current c on c.resident_id=r.id), verification_set as (select r.*,g.id government_id,g.is_verified id_verified,f.verification_status,f.verification_recommendation from resident_set r left join lateral (select * from public.government_ids where resident_id=r.id order by created_at desc nulls last,id limit 1) g on true left join lateral (select * from public.face_verifications where resident_id=r.id order by verified_at desc nulls last,id limit 1) f on true) select coalesce(jsonb_agg(to_jsonb(x) order by label),''[]'') from (select %s label,count(*) count from %s where %s group by 1) x',d.expression,d.source,condition) into rows;
   charts:=charts||jsonb_build_array(jsonb_build_object('section',d.section,'title',d.title,'unit',d.unit,'period',d.period,'kind',case when d.title like '%by Month' then 'trend' when d.title in ('Residents by Sex','Appointments by Status') then 'donut' else 'bar' end,'rows',rows) || case when d.title='Service Requests by Saved Fee' then jsonb_build_object('note','Fees are saved when a request is booked. Amounts marked Historical use earlier pricing; check Services and Approved Fees for current rates.') else '{}'::jsonb end);
 end loop;
 with resident_set as (select distinct on(coalesce(user_id,id)) * from public.residents order by coalesce(user_id,id),updated_at desc nulls last,id)
 select coalesce(jsonb_agg(to_jsonb(x) order by label),'[]') into rows from (select case when c.name='FHONA' then 'Family Head and other needy adults' else c.name end label,count(distinct coalesce(r.user_id,r.id)) count from public.categories c left join public.resident_categories rc on rc.category_id=c.id left join resident_set r on r.id=rc.resident_id and (p_status='all' or r.status=p_status) group by c.id,c.name) x;
 charts:=charts||jsonb_build_array(jsonb_build_object('section','Residents','title','Residents by Selected Category','unit','residents','period',false,'kind','bar','rows',rows,'note','Residents may select several categories. Each resident is counted once per category; category counts can exceed the resident total.'));
 with latest as (select distinct on(coalesce(user_id,id)) * from public.residents order by coalesce(user_id,id),updated_at desc nulls last,id), cohort as (select * from latest where p_status='all' or status=p_status)
 select jsonb_build_object('residentTotal',count(*),'recordTotal',(select count(*) from public.residents),'duplicateRecords',(select count(*) from public.residents)-(select count(*) from latest),
 'addressGroups',count(distinct nullif(lower(regexp_replace(trim(residential_address),'\s+',' ','g')),'')),'reportDate',(now() at time zone 'Asia/Manila')::date,
 'verifiedResidents',count(*) filter(where status='verified')) into result from cohort;
 with latest as (select distinct on(coalesce(user_id,id)) * from public.residents order by coalesce(user_id,id),updated_at desc nulls last,id), cohort as (select * from latest where p_status='all' or status=p_status), evidence as (
 select count(*) total,
 count(*) filter(where birth_date <= (now() at time zone 'Asia/Manila')::date - interval '60 years' and birth_date >= (now() at time zone 'Asia/Manila')::date - interval '130 years') seniors,
 count(*) filter(where birth_date <= (now() at time zone 'Asia/Manila')::date - interval '15 years' and birth_date > (now() at time zone 'Asia/Manila')::date - interval '31 years') youth,
 count(*) filter(where exists(select 1 from public.resident_categories rc join public.categories c on c.id=rc.category_id where rc.resident_id=cohort.id and c.name='PWD')) pwd,
 count(*) filter(where status='pending_review') pending from cohort)
 select jsonb_build_array(
 jsonb_build_object('section','Demographics','title','Senior Program Planning','count',seniors,'denominator',total,'interpretation','Registered residents aged 60–130 on the reporting date.','suggestion','Review senior-service resources against this registered cohort; confirm current residency and individual eligibility before outreach.'),
 jsonb_build_object('section','Demographics','title','Youth Program Planning','count',youth,'denominator',total,'interpretation','Registered residents aged 15–30 on the reporting date.','suggestion','Use this count to review youth-program capacity. The chart age bands use a different grouping; this card states its own age definition.'),
 jsonb_build_object('section','Residents','title','PWD Assistance Planning','count',pwd,'denominator',total,'interpretation','Accounts selecting the PWD category, counted once per account.','suggestion','Review accessible services and assistance capacity. Category selections are reported information and require eligibility checks.'),
 jsonb_build_object('section','Residents','title','Census Review Queue','count',pending,'denominator',total,'interpretation','Current selected-cohort records awaiting review.','suggestion','Review pending applications to improve coverage and the reliability of demographic planning.')) into insights from evidence;
 insights:=insights||jsonb_build_array(jsonb_build_object('section','Services and Appointments','title','Accepted Service Queue',
 'count',(select count(*) from public.appointments where status='confirmed'),'denominator',(select count(*) from public.appointments where status in ('pending','confirmed')),
 'interpretation','Accepted requests among open appointments, across all booking dates.','suggestion','Review appointment capacity and process service receipts after service delivery. Acceptance alone does not prove completion.'));
 return result||jsonb_build_object('charts',charts,'insights',insights,'legacyCompletions',(select count(*) from public.resident_appointment_records where legacy_receipt_missing),
 'postedPayments',(select coalesce(sum(amount),0) from public.service_payments where status='posted' and method='cash' and (p_from is null or paid_at >= p_from::timestamp at time zone 'Asia/Manila') and (p_to is null or paid_at < (p_to+1)::timestamp at time zone 'Asia/Manila')));
end; $function$;

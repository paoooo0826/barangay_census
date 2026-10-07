-- Run as the SQL Editor/database maintenance role. All fixtures and edits roll back.
begin;
create temp table feature_test_context as
select r.id as resident_id,r.user_id as owner_id,r.updated_at as original_version,
 (select user_id from public.admin_profiles where coalesce(is_active,true) limit 1) as admin_id,
 (select u.id from auth.users u where u.id<>r.user_id and not exists(select 1 from public.admin_profiles p where p.user_id=u.id and coalesce(p.is_active,true)) limit 1) as other_id,
 gen_random_uuid() as request_key, null::uuid as appointment_id,null::uuid as payment_id
from public.residents r where r.status='verified' and not public.is_active_admin() and
not exists(select 1 from public.admin_profiles p where p.user_id=r.user_id and coalesce(p.is_active,true)) limit 1;
-- The maintenance role normally has no authenticated JWT; use an explicit owner fixture.
do $$begin if (select count(*) from feature_test_context)<>1 then raise exception 'No verified non-admin resident available for rollback tests'; end if; end$$;
grant all on feature_test_context to authenticated;
set local role authenticated;
do $$
declare c record; draft jsonb; result jsonb; fee numeric; day date:=(now() at time zone 'Asia/Manila')::date+1; categories jsonb; payload jsonb;
begin
 select * into c from feature_test_context;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.owner_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',c.owner_id::text,true);
 -- Existing resident cannot save a new-registration draft.
 begin perform public.save_census_draft('create','{"first_name":"Draft"}',0,null); raise exception 'create draft accepted for existing resident'; exception when serialization_failure then null; end;
 draft:=public.save_census_draft('update','{"first_name":"Draft","email_address":"forged@test.invalid","philsys_number":"forged","file":"blob:fake","categories":[1]}',0,c.original_version);
 if draft->'payload' ?| array['email_address','philsys_number','file'] then raise exception 'protected values leaked into draft'; end if;
 if (draft->>'revision')::int<>1 then raise exception 'first draft revision incorrect'; end if;
 draft:=public.save_census_draft('update','{"first_name":"Updated draft"}',1,c.original_version);
 if (draft->>'revision')::int<>2 then raise exception 'draft revision did not increment'; end if;
 begin perform public.save_census_draft('update','{}',1,c.original_version); raise exception 'stale draft overwrote newer draft'; exception when serialization_failure then null; end;
 begin perform public.delete_census_draft('update',1); raise exception 'stale draft deletion accepted'; exception when serialization_failure then null; end;
 begin insert into public.census_drafts values(c.owner_id,'create','{}',1,null,now()); raise exception 'direct draft write accepted'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.other_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',c.other_id::text,true);
 if exists(select 1 from public.census_drafts where user_id=c.owner_id) then raise exception 'another resident can read draft'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.admin_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',c.admin_id::text,true);
 if exists(select 1 from public.census_drafts where user_id=c.owner_id) then raise exception 'admin can read private resident draft'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.owner_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',c.owner_id::text,true);
 -- An ordinary profile save clears drafts in the same transaction and logs actual field changes.
 select to_jsonb(r)||jsonb_build_object('religion',coalesce(r.religion,'')||' (rollback test)') into payload from public.residents r where id=c.resident_id;
 select coalesce(jsonb_agg(jsonb_build_object('category_id',category_id,'indigenous_group',indigenous_group,'other_description',other_description)),'[]') into categories from public.resident_categories where resident_id=c.resident_id;
 payload:=payload||jsonb_build_object('census_mode','update','expected_updated_at',c.original_version);
 result:=public.save_resident_census(payload,categories,null,null);
 begin perform public.save_resident_census(payload,categories,null,null); raise exception 'old form overwrote updated census'; exception when serialization_failure then null; end;
 if result->>'id'<>c.resident_id::text or exists(select 1 from public.census_drafts where user_id=c.owner_id) then raise exception 'submission did not clear own draft atomically'; end if;
 begin perform public.save_census_draft('update','{}',0,c.original_version); raise exception 'draft accepted for old record version'; exception when serialization_failure then null; end;
 if exists(select 1 from public.admin_resident_history where resident_id=c.resident_id) then raise exception 'resident can read admin audit history'; end if;
 while extract(isodow from day) in (6,7) loop day:=day+1; end loop;
 fee:=public.preview_appointment_fee(c.resident_id,'barangay_clearance',null);
 result:=public.book_resident_appointment(c.resident_id,'barangay_clearance',null,day,'09:00','Feature rollback payment verification',fee,c.request_key);
 result:=result->'appointment';
 if result->>'id' is null then raise exception 'booking did not return appointment'; end if;
 update feature_test_context set appointment_id=(result->>'id')::uuid;
 if (result->>'fee')::numeric is distinct from fee then raise exception 'booking fee mismatch'; end if;
 begin perform public.record_service_payment((result->>'id')::uuid,fee,'TEST-ROLLBACK',fee,gen_random_uuid()); raise exception 'resident could collect payment'; exception when insufficient_privilege then null; end;
 begin perform public.admin_daily_collections(day); raise exception 'resident could access collection totals'; exception when insufficient_privilege then null; end;
end$$;

do $$
declare c record; a public.appointments; p jsonb; retry jsonb; summary jsonb; count_before bigint;
begin
 select * into c from feature_test_context;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.admin_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',c.admin_id::text,true);
 select * into a from public.appointments where id=c.appointment_id;
 if not exists(select 1 from public.admin_resident_history where resident_id=c.resident_id and action='census_updated' and details->'changes' ? 'religion') then raise exception 'field change absent from admin history'; end if;
 begin update public.audit_logs set action='forged' where entity_id=c.resident_id; raise exception 'audit history could be altered'; exception when insufficient_privilege then null; end;
 begin perform public.record_service_payment(a.id,a.fee+1,'TEST-WRONG-FEE',a.fee,gen_random_uuid()); raise exception 'wrong amount accepted'; exception when serialization_failure then null; end;
 begin perform public.record_service_payment(a.id,a.fee,' ',a.fee,gen_random_uuid()); raise exception 'empty receipt accepted'; exception when invalid_parameter_value then null; end;
 select count(*) into count_before from public.service_payments;
 p:=public.record_service_payment(a.id,a.fee,'TEST-ROLLBACK',a.fee,c.request_key);
 retry:=public.record_service_payment(a.id,a.fee,'test-rollback',a.fee,c.request_key);
 if p->>'id'<>retry->>'id' or (select count(*) from public.service_payments)<>count_before+1 then raise exception 'retry recorded a second payment'; end if;
 update feature_test_context set payment_id=(p->>'id')::uuid;
 if (select status from public.appointments where id=a.id)<>a.status then raise exception 'collection changed appointment status'; end if;
 begin perform public.record_service_payment(a.id,a.fee,'TEST-SECOND',a.fee,gen_random_uuid()); raise exception 'second collection accepted'; exception when unique_violation then null; end;
 summary:=public.admin_daily_collections((now() at time zone 'Asia/Manila')::date);
 if (summary->>'collected')::numeric<a.fee or (summary->>'paid_requests')::int<1 then raise exception 'daily collection excludes posted payment'; end if;
 if not exists(select 1 from public.admin_payment_records where id=(p->>'id')::uuid) then raise exception 'admin receipt view missing payment'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.other_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',c.other_id::text,true);
 if exists(select 1 from public.service_payments where id=(p->>'id')::uuid) then raise exception 'another resident sees receipt'; end if;
 begin perform public.void_service_payment((p->>'id')::uuid,'Not allowed'); raise exception 'resident can void payment'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.owner_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',c.owner_id::text,true);
 if not exists(select 1 from public.service_payments where id=(p->>'id')::uuid) then raise exception 'owner cannot read own receipt'; end if;
 if exists(select 1 from public.admin_payment_records) then raise exception 'resident sees admin payment list'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.admin_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',c.admin_id::text,true);
 begin perform public.void_service_payment((p->>'id')::uuid,''); raise exception 'void without reason accepted'; exception when invalid_parameter_value then null; end;
 perform public.void_service_payment((p->>'id')::uuid,'Rollback correction test');
 if (select status from public.service_payments where id=(p->>'id')::uuid)<>'voided' then raise exception 'void not preserved'; end if;
 begin perform public.void_service_payment((p->>'id')::uuid,'Repeated correction'); raise exception 'stale void accepted'; exception when serialization_failure then null; end;
 -- A corrected collection may be entered once; the original receipt number remains reserved.
 begin perform public.record_service_payment(a.id,a.fee,'test-rollback',a.fee,gen_random_uuid()); raise exception 'voided receipt number reused'; exception when unique_violation then null; end;
 perform public.record_service_payment(a.id,a.fee,'TEST-ROLLBACK-REPLACEMENT',a.fee,gen_random_uuid());
 if (select count(*) from public.service_payments where appointment_id=a.id)<>2 then raise exception 'correction lost receipt history'; end if;
end$$;
reset role;
-- Make a free and a cancelled fixture using the maintenance role; never change real rows.
do $$declare c record; a public.appointments; free_id uuid; cancelled_id uuid; actor uuid; begin
 select * into c from feature_test_context;
 select * into a from public.appointments where id=c.appointment_id;
 insert into public.appointments(resident_id,user_id,service_type,service_purpose,appointment_date,appointment_time,purpose,status,request_key)
 values(a.resident_id,a.user_id,'certificate_of_residency','low_income',a.appointment_date,'10:00','Free rollback verification','pending',gen_random_uuid()) returning id into free_id;
 -- enforce_appointment_request calculates the first Low Income price from stored history.
 if (select fee from public.appointments where id=free_id)<>0 then
   update public.appointments set fee=0 where id=free_id;
 end if;
 insert into public.appointments(resident_id,user_id,service_type,appointment_date,appointment_time,purpose,status,request_key)
 values(a.resident_id,a.user_id,'barangay_clearance',a.appointment_date,'11:00','Cancelled rollback verification','pending',gen_random_uuid()) returning id into cancelled_id;
 update public.appointments set status='cancelled',cancellation_reason='Rollback test',cancelled_at=now() where id=cancelled_id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.admin_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',c.admin_id::text,true);
 begin perform public.record_service_payment(free_id,30,'TEST-FREE',0,gen_random_uuid()); raise exception 'free request collected payment'; exception when invalid_parameter_value then null; end;
 begin perform public.record_service_payment(cancelled_id,a.fee,'TEST-CANCELLED',a.fee,gen_random_uuid()); raise exception 'cancelled request collected payment'; exception when invalid_parameter_value then null; end;
end$$;
rollback;
select 'Draft CAS/ownership, atomic cleanup, audit history, payment fees/idempotency/permissions, receipt correction, daily totals and free/cancelled protections passed. All fixtures rolled back.' as result;

-- Apply staged schema before this script in the SAME rollback-only transaction.
create temp table brims_test_ids(label text primary key,id uuid not null default gen_random_uuid());
insert into brims_test_ids(label) values('admin'),('admin2'),('resident'),('other'),('landlord'),('landlord2'),('boarder'),('house'),('house2'),('feedback'),('incident'),('appointment'),('free'),('receipt'),('message');
insert into auth.users(id,email) select id,'brims-rollback-'||id::text||'@example.invalid' from brims_test_ids where label in ('admin','admin2','resident','other','landlord','landlord2','boarder');
insert into public.admin_profiles(user_id,full_name,is_active) select id,'Rollback Administrator',true from brims_test_ids where label in ('admin','admin2');
insert into public.residents(id,user_id,tracking_number,first_name,last_name,birth_date,birth_place,sex,civil_status,residential_address,tenurial_status,status,boarding_status,boarding_house_name,boarding_house_address,boarding_tenant_count,boarding_landlord_name,boarding_start_date)
select id,id,'TEST-'||id::text,'Rollback',label||id::text,'2000-01-01','Test Location','Male','Single','Rollback Test Address','House Owner','verified',
 case when label in ('landlord','landlord2') then 'landlord' when label='boarder' then 'boarder' else 'neither' end,
 case when label in ('landlord','landlord2','boarder') then 'Rollback House' end,case when label in ('landlord','landlord2','boarder') then 'Rollback House Address' end,
 case when label in ('landlord','landlord2') then 0 end,case when label='boarder' then 'Rollback Owner' end,case when label='boarder' then current_date-1 end
from brims_test_ids where label in ('resident','other','landlord','landlord2','boarder');
insert into public.boarding_houses(id,name,address,owner_resident_id,owner_user_id,owner_name,active)
select h.id,'Rollback House','Rollback House Address',o.id,o.id,'Rollback Owner',true from brims_test_ids h cross join brims_test_ids o where (h.label='house' and o.label='landlord') or (h.label='house2' and o.label='landlord2');
insert into public.boarder_stays(boarding_house_id,resident_id,resident_name,tracking_number,move_in_date,status,updated_by,updater_name)
select h.id,b.id,'Private Boarder Identity','TEST-PRIVATE-BOARDER',current_date-1,'staying',(select id from brims_test_ids where label='admin'),'Rollback Administrator' from brims_test_ids h cross join brims_test_ids b where h.label='house' and b.label='boarder';
grant select,update on brims_test_ids to authenticated;
create function pg_temp.become(p_label text) returns void language plpgsql as $$declare actor uuid;begin select id into actor from brims_test_ids where label=p_label;perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',actor::text,true);end $$;
create function pg_temp.fail_test_completion() returns trigger language plpgsql as $$begin if new.purpose='Rollback deliberate completion failure' and new.status='completed' then raise exception 'Deliberate completion failure' using errcode='P0001';end if;return new;end $$;
create trigger zz_brims_rollback_failure before update on public.appointments for each row execute function pg_temp.fail_test_completion();
set local role authenticated;
do $$
declare own uuid;other uuid;a uuid;free_a uuid;value jsonb;again jsonb;fee numeric;day date:=(now() at time zone 'Asia/Manila')::date+1;key uuid:=gen_random_uuid();receipt jsonb;bad uuid;f jsonb;i jsonb;h uuid;h2 uuid;b uuid;before_count bigint;summary jsonb;analytics jsonb;chart jsonb;
begin
 select id into own from brims_test_ids where label='resident';select id into other from brims_test_ids where label='other';select id into h from brims_test_ids where label='house';select id into h2 from brims_test_ids where label='house2';select id into b from brims_test_ids where label='boarder';
 perform pg_temp.become('resident');
 begin perform public.admin_notification_feed();raise exception 'Resident accessed admin feed';exception when insufficient_privilege then null;end;
 begin perform public.admin_system_analytics();raise exception 'Resident accessed admin analytics';exception when insufficient_privilege then null;end;
 while extract(isodow from day) in (6,7) loop day:=day+1;end loop;
 fee:=public.preview_appointment_fee(own,'barangay_clearance',null);
 value:=public.book_resident_appointment(own,'barangay_clearance',null,day,'09:00','Rollback paid service request',fee,key);a:=(value->'appointment'->>'id')::uuid;
 if a is null then raise exception 'Appointment was not booked';end if;
 begin perform public.record_service_payment(a,fee,'BRIMS-TEST',fee,key);raise exception 'Resident issued receipt';exception when insufficient_privilege then null;end;
 perform pg_temp.become('admin');
 begin perform public.record_service_payment(a,fee,'BRIMS-TEST',fee,key);raise exception 'Pending request received receipt';exception when invalid_parameter_value then null;end;
 perform public.transition_appointment(a,'pending','confirmed',null);
 if (select status from public.appointments where id=a)<>'confirmed' then raise exception 'Acceptance completed appointment';end if;
 begin perform public.transition_appointment(a,'confirmed','completed',null);raise exception 'RPC completed without receipt';exception when check_violation then null;end;
 begin update public.appointments set status='completed' where id=a;raise exception 'Direct update completed without receipt';exception when check_violation then null;end;
 select count(*) into before_count from public.service_payments where appointment_id=a;
 begin perform public.record_service_payment(a,fee+1,'BRIMS-WRONG',fee,key);raise exception 'Wrong fee accepted';exception when serialization_failure then null;end;
 if (select count(*) from public.service_payments where appointment_id=a)<>before_count or (select status from public.appointments where id=a)<>'confirmed' then raise exception 'Failed receipt left partial changes';end if;
 receipt:=public.record_service_payment(a,fee,'BRIMS-TEST-'||a::text,fee,key);
 again:=public.record_service_payment(a,fee,lower('BRIMS-TEST-'||a::text),fee,key);
 if receipt->>'id'<>again->>'id' or (select count(*) from public.service_payments where appointment_id=a)<>1 then raise exception 'Receipt retry duplicated data';end if;
 if not exists(select 1 from public.resident_appointment_records where id=a and status='completed' and has_valid_receipt and completed_at is not null and receipt_verified_at is not null) then raise exception 'Receipt and completion are not atomic';end if;
 begin perform public.record_service_payment(a,fee,'BRIMS-SECOND',fee,gen_random_uuid());raise exception 'Duplicate payment accepted';exception when invalid_parameter_value then null;end;
 perform public.void_service_payment((receipt->>'id')::uuid,'Rollback correction');
 if (select status from public.appointments where id=a)<>'confirmed' or (select has_valid_receipt from public.resident_appointment_records where id=a) then raise exception 'Void left completed eligibility';end if;
 begin perform public.record_service_payment(a,fee,'BRIMS-TEST-'||a::text,fee,gen_random_uuid());raise exception 'Voided receipt number reused';exception when unique_violation then null;end;
 perform public.record_service_payment(a,fee,'BRIMS-CORRECTED-'||a::text,fee,gen_random_uuid());
 if (select count(*) from public.service_payments where appointment_id=a)<>2 then raise exception 'Correction lost receipt history';end if;
 perform pg_temp.become('resident');
 value:=public.book_resident_appointment(own,'certificate_of_residency','low_income',day,'10:00','Rollback zero fee service request',0,gen_random_uuid());free_a:=(value->'appointment'->>'id')::uuid;
 if free_a is null then raise exception 'Zero-fee request unavailable';end if;
 perform pg_temp.become('admin');perform public.transition_appointment(free_a,'pending','confirmed',null);
 receipt:=public.record_service_payment(free_a,0,'BRIMS-ZERO-'||free_a::text,0,gen_random_uuid());
 if receipt->>'method'<>'zero_fee_acknowledgment' or (receipt->>'amount')::numeric<>0 or not exists(select 1 from public.resident_appointment_records where id=free_a and status='completed' and has_valid_receipt) then raise exception 'Zero-fee release failed';end if;
 summary:=public.admin_daily_collections((now() at time zone 'Asia/Manila')::date);
 if (summary->>'free_requests')::int<1 then raise exception 'Zero-fee release absent from report';end if;
 perform pg_temp.become('resident');
 value:=public.book_resident_appointment(own,'barangay_clearance',null,day,'11:00','Rollback deliberate completion failure',fee,gen_random_uuid());bad:=(value->'appointment'->>'id')::uuid;
 perform pg_temp.become('admin');perform public.transition_appointment(bad,'pending','confirmed',null);
 begin perform public.record_service_payment(bad,fee,'BRIMS-FAIL-'||bad::text,fee,gen_random_uuid());raise exception 'Failure injection did not run';exception when raise_exception then if sqlerrm<>'Deliberate completion failure' then raise;end if;end;
 if exists(select 1 from public.service_payments where appointment_id=bad) or (select status from public.appointments where id=bad)<>'confirmed' then raise exception 'Mid-operation failure left a receipt or completion';end if;
 perform pg_temp.become('resident');
 f:=public.submit_resident_feedback('suggestion','Rollback written feedback for testing.',key);
 again:=public.submit_resident_feedback('suggestion','Rollback written feedback for testing.',key);
 if f->>'id'<>again->>'id' then raise exception 'Duplicate feedback retry';end if;
 begin perform public.submit_resident_feedback('comment','short',gen_random_uuid());raise exception 'Invalid feedback accepted';exception when invalid_parameter_value then null;end;
 i:=public.submit_incident_report('other','Rollback incident report for ownership tests.','Rollback Test Location',now()-interval '1 hour',array[]::text[],key);
 again:=public.submit_incident_report('other','Rollback incident report for ownership tests.','Rollback Test Location',now()-interval '1 hour',array[]::text[],key);
 if i->>'id'<>again->>'id' or i->>'tracking_reference' is null then raise exception 'Incident retry/tracking failed';end if;
 begin perform public.submit_incident_report('other','Rollback incident report for ownership tests.','Rollback Test Location',now()-interval '1 hour',array['forged/image.jpg'],gen_random_uuid());raise exception 'Foreign attachment accepted';exception when insufficient_privilege then null;end;
 -- The incident attachment remains private in SQL/Storage metadata even when its path is guessed.
 insert into storage.objects(bucket_id,name,metadata) values('incident-attachments',own::text||'/'||gen_random_uuid()::text||'/staged.jpg','{"mimetype":"image/jpeg","size":1000}');
 if not exists(select 1 from storage.objects where bucket_id='incident-attachments' and split_part(name,'/',1)=own::text) then raise exception 'Owner cannot access staged image';end if;
 perform pg_temp.become('other');
 if exists(select 1 from storage.objects where bucket_id='incident-attachments' and split_part(name,'/',1)=own::text) then raise exception 'Private incident image exposed';end if;
 if exists(select 1 from public.resident_feedback where id=(f->>'id')::uuid) or exists(select 1 from public.incident_reports where id=(i->>'id')::uuid) or exists(select 1 from public.service_payments where appointment_id=a) then raise exception 'Cross-resident data exposed';end if;
 begin perform public.review_community_case('feedback',(f->>'id')::uuid,(f->>'updated_at')::timestamptz,'resolved','forged');raise exception 'Resident reviewed feedback';exception when insufficient_privilege then null;end;
 begin perform public.resident_notification_feed(own);raise exception 'Foreign resident feed exposed';exception when insufficient_privilege then null;end;
 perform pg_temp.become('admin');
 f:=public.review_community_case('feedback',(f->>'id')::uuid,(f->>'updated_at')::timestamptz,'reviewed','Thank you for this suggestion.');
 again:=public.review_community_case('feedback',(f->>'id')::uuid,'1900-01-01','reviewed','Thank you for this suggestion.');
 if f<>again then raise exception 'Review retry was not idempotent';end if;
 begin perform public.review_community_case('feedback',(f->>'id')::uuid,'1900-01-01','resolved','Changed response');raise exception 'Stale review accepted';exception when serialization_failure then null;end;
 begin perform public.review_community_case('incident',(i->>'id')::uuid,(i->>'updated_at')::timestamptz,'rejected','');raise exception 'Rejection without reason accepted';exception when invalid_parameter_value then null;end;
 perform public.review_community_case('incident',(i->>'id')::uuid,(i->>'updated_at')::timestamptz,'under_review','Review in progress.');
 value:=public.admin_notification_feed();before_count:=(value->>'unread_count')::bigint;
 if before_count<3 then raise exception 'Admin events missing';end if;
 perform public.mark_admin_notifications_read();value:=public.admin_notification_feed();if (value->>'unread_count')::int<>0 then raise exception 'Mark all missed unread items';end if;
 perform pg_temp.become('admin2');value:=public.admin_notification_feed();if (value->>'unread_count')::bigint<>before_count then raise exception 'Admin read state shared incorrectly';end if;
 perform pg_temp.become('landlord');
 if exists(select 1 from public.boarder_stays where resident_id=b) then raise exception 'Landlord can read boarder identity';end if;
 begin perform public.manage_boarding('move_out',jsonb_build_object('stay_id',gen_random_uuid(),'departure_date',current_date));raise exception 'Landlord identified endpoint remains open';exception when insufficient_privilege then null;end;
 value:=public.boarding_count_summary(h);if value->'registered'->>'current'<>'1' or value::text like '%Private Boarder Identity%' or value::text like '%TEST-PRIVATE-BOARDER%' then raise exception 'Count-only result leaked/incorrect';end if;
 begin perform public.boarding_count_summary(h2);raise exception 'Foreign house accessible';exception when insufficient_privilege then null;end;
 value:=public.record_boarding_count(h,'baseline',5,current_date,0,key);again:=public.record_boarding_count(h,'baseline',5,current_date,0,key);if value<>again then raise exception 'Count retry duplicated';end if;
 perform public.record_boarding_count(h,'arrival',2,current_date,1,gen_random_uuid());
 begin perform public.record_boarding_count(h,'departure',8,current_date,2,gen_random_uuid());raise exception 'Negative occupancy allowed';exception when invalid_parameter_value then null;end;
 begin perform public.record_boarding_count(h,'arrival',1,current_date,1,gen_random_uuid());raise exception 'Stale count accepted';exception when serialization_failure then null;end;
 perform public.record_boarding_count(h,'departure',1,current_date,2,gen_random_uuid());
 value:=public.boarding_count_summary(h);if value->'reported'->>'current'<>'6' or value->'registered'->>'current'<>'1' then raise exception 'Reported and registered counts mixed';end if;
 value:=public.send_boarding_message(h,'Rollback landlord message',key);again:=public.send_boarding_message(h,'Rollback landlord message',key);if value<>again or value->>'sender_role'<>'landlord' then raise exception 'Message retry/sender role failed';end if;
 bad:=(value->>'id')::uuid;
 perform pg_temp.become('admin');
 perform public.mark_boarding_conversation_read(h,(value->>'created_at')::timestamptz);
 perform pg_temp.become('landlord');
 perform public.send_boarding_message(h,'New message after read boundary',gen_random_uuid());
 perform pg_temp.become('admin');
 if not exists(select 1 from jsonb_array_elements(public.boarding_conversations()) x where x->>'id'=h::text and (x->>'unread_count')::int=1) then raise exception 'Read marker swallowed a newer message';end if;
 perform pg_temp.become('landlord2');if exists(select 1 from public.boarding_messages where id=bad) then raise exception 'Foreign landlord reads messages';end if;
 begin perform public.send_boarding_message(h,'Foreign message',gen_random_uuid());raise exception 'Foreign landlord sends message';exception when insufficient_privilege then null;end;
 perform pg_temp.become('boarder');if exists(select 1 from public.boarding_messages where boarding_house_id=h) then raise exception 'Boarder reads landlord conversation';end if;
 value:=public.boarding_count_summary(h);if value->>'can_manage'<>'false' or value->'reported'<>'null'::jsonb then raise exception 'Boarder sees management ledger';end if;
 perform pg_temp.become('admin');perform public.send_boarding_message(h,'Rollback admin response',key);
 analytics:=public.admin_system_analytics();
 if (analytics->>'residentTotal')::int<>(select count(distinct coalesce(user_id,id)) from public.residents) then raise exception 'Analytics denominator mismatch';end if;
 if jsonb_array_length(analytics->'charts')<40 or jsonb_array_length(analytics->'insights')<4 then raise exception 'Analytics missing charts/insights';end if;
 analytics:=public.admin_system_analytics(current_date,current_date,'verified');
 for chart in select x.value from jsonb_array_elements(analytics->'charts') x where x.value->>'title' in ('Residents by Registration Status','Residents by Age Group','Registered Residents by Current Residency','Residents by ID Verification Status') loop
  if chart->>'title'='Registered Residents by Current Residency' and chart->>'unit'<>'residents' then raise exception 'Residency chart has the wrong counting unit';end if;
  if (select coalesce(sum((x->>'count')::int),0) from jsonb_array_elements(chart->'rows') x)<>(analytics->>'residentTotal')::int then raise exception 'Chart denominator mismatch: %',chart->>'title';end if;
 end loop;
end $$;
reset role;
rollback;
select 'BRIMS role isolation, atomic receipts, zero-fee release, retries, review CAS, count privacy and analytics reconciliation passed; all test records rolled back.' as result;

begin;
-- Synthetic accounts, bookings, catalog changes, and audit rows are rolled back.
create temporary table original_request_fees as select id, fee from public.appointments;
create temporary table fee_test_accounts(label text primary key, uid uuid, rid uuid);
insert into fee_test_accounts
select label,gen_random_uuid(),gen_random_uuid()
from unnest(array['student','other','admin']) label;
grant select on fee_test_accounts to authenticated;
insert into auth.users(id,email)
select uid,uid::text||'@test.invalid' from fee_test_accounts;
insert into public.residents(id,user_id,tracking_number,first_name,last_name,birth_date,birth_place,sex,civil_status,residential_address,tenurial_status,education_status)
select rid,uid,'FEE-'||rid,'Fee','Test '||label,'1990-01-01','Baguio','Male','Single','Test Address','House Owner',
case when label='student' then 'Currently Studying' else 'Not Currently Studying' end
from fee_test_accounts where label<>'admin';
insert into public.admin_profiles(user_id,full_name,is_active)
select uid,'Fee test administrator',true from fee_test_accounts where label='admin';

do $$ begin
 if (select count(*) from public.service_catalog)<>2 or exists(
   select 1 from public.service_catalog where base_fee<>100 or (student_fee is not null and student_fee<>100)
 ) then raise exception 'FAIL: inconsistent current paid service rates'; end if;
end $$;

select set_config('request.jwt.claim.sub',(select uid::text from fee_test_accounts where label='student'),true);
set local role authenticated;
do $$ declare r uuid; d date:=((now() at time zone 'Asia/Manila')::date+90); result jsonb; purpose text; begin
 select rid into r from fee_test_accounts where label='student';
 while extract(isodow from d)>5 loop d:=d+1; end loop;
 if public.preview_appointment_fee(r,'barangay_clearance')<>100 then raise exception 'FAIL: student clearance quote'; end if;
 foreach purpose in array array['good_moral','financial','medical_assistance'] loop
   if public.preview_appointment_fee(r,'certificate_of_residency',purpose)<>100 then raise exception 'FAIL: residency quote for %',purpose; end if;
 end loop;
 result:=public.book_resident_appointment(r,'barangay_clearance',null,d,'09:00','Uniform fee test',130,gen_random_uuid());
 if coalesce((result->>'booked')::boolean,false) or not coalesce((result->>'fee_changed')::boolean,false)
    or (result->>'current_fee')::numeric<>100 then raise exception 'FAIL: obsolete expected price accepted'; end if;
 result:=public.book_resident_appointment(r,'barangay_clearance',null,d,'09:00','Uniform fee test',100,gen_random_uuid());
 if not coalesce((result->>'booked')::boolean,false) then raise exception 'FAIL: standard booking failed: %',result; end if;
 if not exists(select 1 from public.appointments where resident_id=r and service_type='barangay_clearance' and fee=100) then raise exception 'FAIL: stored clearance fee'; end if;
 if public.preview_appointment_fee(r,'certificate_of_residency','low_income')<>0 then raise exception 'FAIL: first Low Income exemption'; end if;
 result:=public.book_resident_appointment(r,'certificate_of_residency','low_income',d,'10:00','Uniform fee exemption test',0,gen_random_uuid());
 if not coalesce((result->>'booked')::boolean,false) then raise exception 'FAIL: free booking failed: %',result; end if;
 if public.preview_appointment_fee(r,'certificate_of_residency','low_income')<>100 then raise exception 'FAIL: subsequent Low Income fee'; end if;
 perform public.cancel_resident_appointment((result->'appointment'->>'id')::uuid,'Fee regression test');
 if public.preview_appointment_fee(r,'certificate_of_residency','low_income')<>100 then raise exception 'FAIL: cancelled request resets exemption'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select uid::text from fee_test_accounts where label='other'),true);
set local role authenticated;
do $$ declare r uuid; begin
 select rid into r from fee_test_accounts where label='other';
 if public.preview_appointment_fee(r,'barangay_clearance')<>100 then raise exception 'FAIL: non-student clearance quote'; end if;
 if public.preview_appointment_fee(r,'certificate_of_residency','financial')<>100 then raise exception 'FAIL: non-student residency quote'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select uid::text from fee_test_accounts where label='admin'),true);
set local role authenticated;
do $$ declare chart jsonb; begin
 select c into strict chart from jsonb_array_elements(public.admin_system_analytics()->'charts') c
 where c->>'title'='Service Requests by Saved Fee';
 if not exists(select 1 from jsonb_array_elements(chart->'rows') r where r->>'label'='₱100' and (r->>'count')::int>0) then raise exception 'FAIL: current fee chart label'; end if;
 if exists(select 1 from jsonb_array_elements(chart->'rows') r where r->>'label' not in ('Free','₱100') and r->>'label' not like '%(Historical)') then raise exception 'FAIL: unlabeled historical fee'; end if;
 if chart->>'note' is null then raise exception 'FAIL: missing saved fee explanation'; end if;
end $$;
reset role;
update public.service_catalog set base_fee=105,student_fee=case when student_fee is not null then 105 end;
do $$ begin
 if exists(select 1 from public.appointments a join fee_test_accounts t on t.rid=a.resident_id where a.service_type='barangay_clearance' and a.fee<>100) then raise exception 'FAIL: repriced saved request'; end if;
 if exists(select 1 from original_request_fees o left join public.appointments a using(id) where a.id is null or a.fee is distinct from o.fee) then raise exception 'FAIL: changed original request fee'; end if;
end $$;
select 'PASS: all paid quotes and new bookings use 100 PHP, obsolete quotes are rejected, first Low Income exemption remains free, saved fees are preserved, and historical chart labels are explicit' result;
rollback;

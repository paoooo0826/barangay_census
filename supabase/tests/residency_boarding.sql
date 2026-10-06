begin;
-- Run in a transaction; fixture users and records are rolled back.
create temporary table census_test_accounts(label text primary key, uid uuid, rid uuid, house_id uuid);
insert into census_test_accounts(label,uid,rid) select label,gen_random_uuid(),gen_random_uuid() from unnest(array['admin','owner1','owner2','boarder']) label;
grant select,update on census_test_accounts to authenticated;
insert into auth.users(id,email) select uid,'census-verification-'||uid||'@example.invalid' from census_test_accounts;
insert into public.residents(id,user_id,tracking_number,first_name,last_name,birth_date,birth_place,sex,civil_status,residential_address,tenurial_status)
select rid,uid,'TEST-'||rid,'Test',label,'1990-01-01','Baguio','Male','Single','Test Address','Landlord/Landlady' from census_test_accounts;
insert into public.admin_profiles(user_id,full_name,is_active) select uid,'Test administrator',true from census_test_accounts where label='admin';
select set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'role','authenticated')::text from census_test_accounts where label='admin'),true);
set local role authenticated;
do $$ declare a record; h jsonb; begin
 for a in select * from census_test_accounts where label in ('owner1','owner2') loop
   h:=public.manage_boarding('save_house',jsonb_build_object('name','Test house '||a.label,'address','Test address','owner_resident_id',a.rid));
   update census_test_accounts set house_id=(h->>'id')::uuid where label=a.label;
 end loop;
end $$;
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'role','authenticated')::text from census_test_accounts where label='owner1'),true);
set local role authenticated;
do $$ declare rejected boolean; h uuid; other_h uuid; tracking text; s jsonb; begin
 select house_id into h from census_test_accounts where label='owner1';
 select house_id into other_h from census_test_accounts where label='owner2';
 select 'TEST-'||rid into tracking from census_test_accounts where label='boarder';
 if (select count(*) from public.boarding_houses where id in (h,other_h))<>1 then raise exception 'FAIL: owner house RLS'; end if;
 rejected:=false;
 begin perform public.manage_boarding('move_in',jsonb_build_object('house_id',other_h,'tracking_number',tracking,'move_in_date',current_date-10)); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'FAIL: owner updated another house'; end if;
 rejected:=false;
 begin perform public.manage_boarding('save_house',jsonb_build_object('name','Invalid assignment','address','Test','owner_resident_id',(select rid from census_test_accounts where label='owner1'))); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'FAIL: owner reassigned house'; end if;
 s:=public.manage_boarding('move_in',jsonb_build_object('house_id',h,'tracking_number',tracking,'move_in_date',current_date-10));
 rejected:=false;
 begin perform public.manage_boarding('move_out',jsonb_build_object('stay_id',s->>'id','departure_date','')); exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL: empty departure accepted'; end if;
 rejected:=false;
 begin perform public.manage_boarding('move_in',jsonb_build_object('house_id',h,'tracking_number',tracking,'move_in_date',current_date-9)); exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL: duplicate active stay accepted'; end if;
 perform public.manage_boarding('move_out',jsonb_build_object('stay_id',s->>'id','departure_date',current_date-5));
 rejected:=false;
 begin perform public.manage_boarding('move_out',jsonb_build_object('stay_id',s->>'id','departure_date',current_date-4)); exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL: closed stay edited'; end if;
 perform public.manage_boarding('move_in',jsonb_build_object('house_id',h,'tracking_number',tracking,'move_in_date',current_date-4));
 if (select count(*) from public.boarder_stays where boarding_house_id=h)<>2 then raise exception 'FAIL: past stays lost'; end if;
 if (select count(*) from public.boarder_occupancy_history where boarding_house_id=h)<>3 then raise exception 'FAIL: occupancy audit incomplete'; end if;
 rejected:=false;
 begin update public.boarding_houses set owner_user_id=auth.uid() where id=other_h; exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'FAIL: direct owner reassignment grant'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'role','authenticated')::text from census_test_accounts where label='owner2'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.boarder_stays where boarding_house_id=(select house_id from census_test_accounts where label='owner1')) then raise exception 'FAIL: unrelated owner can read stays'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'role','authenticated')::text from census_test_accounts where label='owner1'),true);
set local role authenticated;
do $$ declare payload jsonb; saved jsonb; rejected boolean:=false; r uuid; begin
 select rid into r from census_test_accounts where label='owner1';
 payload:=jsonb_build_object('first_name','Test','last_name','owner1','birth_date','1990-01-01','birth_place','Baguio','sex','Male','civil_status','Single','region','CAR','province','Benguet','city_municipality','Baguio','barangay','Old Lucban','residential_address','Test address','citizenship','Filipino','tenurial_status','Landlord/Landlady','residence_start_date',current_date-1,'residence_classification','temporary');
 saved:=public.save_resident_census(payload,'[]',null,null);
 if saved->>'tenurial_status'<>'Landlord/Landlady' then raise exception 'FAIL: landlord option not saved'; end if;
 if (select current_classification from public.residency_current where resident_id=r)<>'temporary' then raise exception 'FAIL: temporary start not saved'; end if;
 begin perform public.save_resident_census(payload||jsonb_build_object('residence_start_date',current_date-2),'[]',null,null); exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL: original residence start overwritten'; end if;
end $$;
reset role;
-- Isolate residency tests from occupancy and test calendar month arithmetic.
insert into public.residency_periods(resident_id,start_date,initial_classification,recorded_by)
select rid,((now() at time zone 'Asia/Manila')::date - interval '6 months')::date,'temporary',uid from census_test_accounts where label='boarder';
select set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'role','authenticated')::text from census_test_accounts where label='boarder'),true);
set local role authenticated;
do $$ declare r uuid; begin
 select rid into r from census_test_accounts where label='boarder';
 if (select current_classification from public.residency_current where resident_id=r)<>'resident' then raise exception 'FAIL: six-month transition'; end if;
 if (select count(*) from public.residency_history where resident_id=r)<>2 then raise exception 'FAIL: classification history'; end if;
 if (select count(*) from public.boarder_stays where resident_id=r)<>2 then raise exception 'FAIL: boarder cannot view own past stays'; end if;
 if ('2024-08-31'::date + interval '6 months')::date <> '2025-02-28'::date then raise exception 'FAIL: month-end calculation'; end if;
 if ('2023-08-31'::date + interval '6 months')::date <> '2024-02-29'::date then raise exception 'FAIL: leap-year calculation'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'role','authenticated')::text from census_test_accounts where label='admin'),true);
set local role authenticated;
do $$ declare r uuid; a_id uuid; profile_id uuid; begin
 select rid into r from census_test_accounts where label='boarder';
 perform public.manage_residency(r,'end',current_date-2,null);
 if (select count(*) from public.residency_current where resident_id=r and current_classification='ended')<>1 then raise exception 'FAIL: residence period not ended'; end if;
 perform public.manage_residency(r,'start',current_date-1,'temporary');
 if (select current_classification from public.residency_current where resident_id=r and end_date is null)<>'temporary' then raise exception 'FAIL: interrupted residency reused old date'; end if;
 if (select count(*) from public.boarder_stays where resident_id=r)<>2 then raise exception 'FAIL: residency changed occupancy'; end if;
 select id into profile_id from public.admin_profiles where user_id=auth.uid();
 insert into public.announcements(title,message,priority,audience,is_published,created_by) values('Census verification announcement','Temporary verification content','info','all',true,profile_id) returning id into a_id;
 update public.announcements set message='Edited verification content' where id=a_id;
 update public.announcements set archived=true,archived_at=now(),archived_by=profile_id where id=a_id;
 if not exists(select 1 from public.announcements where id=a_id and archived) then raise exception 'FAIL: archive unavailable to admin'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'role','authenticated')::text from census_test_accounts where label='boarder'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.announcements where title='Census verification announcement') then raise exception 'FAIL: resident can see archived announcement'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'role','authenticated')::text from census_test_accounts where label='admin'),true);
set local role authenticated;
update public.announcements set archived=false,archived_at=null,archived_by=null where title='Census verification announcement';
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'role','authenticated')::text from census_test_accounts where label='boarder'),true);
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.announcements where title='Census verification announcement' and message='Edited verification content') then raise exception 'FAIL: restored announcement not visible'; end if;
end $$;
reset role;
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'role','authenticated')::text from census_test_accounts where label='boarder'),true);
set local role authenticated;
create temporary table census_test_appointments(kind text,id uuid);
grant select on census_test_appointments to authenticated;
do $$ declare r uuid; d date:=current_date+1; result jsonb; key uuid:=gen_random_uuid(); begin
 select rid into r from census_test_accounts where label='boarder';
 while extract(isodow from d) in (6,7) loop d:=d+1; end loop;
 result:=public.book_resident_appointment(r,'certificate_of_residency','low_income',d,'09:00','Verification test',0,key);
 if not coalesce((result->>'booked')::boolean,false) then raise exception 'FAIL: first low-income request was not free'; end if;
 insert into census_test_appointments values('complete',(result->'appointment'->>'id')::uuid);
 result:=public.book_resident_appointment(r,'certificate_of_residency','low_income',d,'09:00','Verification test',0,key);
 if (select count(*) from public.appointments where resident_id=r)<>1 then raise exception 'FAIL: duplicate booking was not prevented'; end if;
 if public.preview_appointment_fee(r,'certificate_of_residency','low_income')<>30 then raise exception 'FAIL: first-free state did not persist'; end if;
 result:=public.book_resident_appointment(r,'certificate_of_residency','financial',d,'10:00','Verification test',30,gen_random_uuid());
 insert into census_test_appointments values('cancel',(result->'appointment'->>'id')::uuid);
 result:=public.cancel_resident_appointment((result->'appointment'->>'id')::uuid,'Schedule changed');
 if not coalesce((result->>'cancelled')::boolean,false) then raise exception 'FAIL: cancellation did not save'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'role','authenticated')::text from census_test_accounts where label='admin'),true);
set local role authenticated;
do $$ declare a uuid; result jsonb; begin
 select id into a from census_test_appointments where kind='complete';
 result:=public.transition_appointment(a,'pending','confirmed',null);
 if not coalesce((result->>'updated')::boolean,false) then raise exception 'FAIL: confirmation failed'; end if;
 result:=public.transition_appointment(a,'confirmed','completed',null);
 if not coalesce((result->>'updated')::boolean,false) then raise exception 'FAIL: completion failed'; end if;
 if not exists(select 1 from public.appointments where id=a and status='completed' and completed_at is not null) then raise exception 'FAIL: completion history fields'; end if;
 if not exists(select 1 from public.appointments where id=(select id from census_test_appointments where kind='cancel') and status='cancelled' and cancellation_reason='Schedule changed' and cancelled_at is not null) then raise exception 'FAIL: cancellation history fields'; end if;
 if exists(select 1 from public.appointments where id in (select id from census_test_appointments) and status in ('pending','confirmed')) then raise exception 'FAIL: completed or cancelled booking still active'; end if;
end $$;
reset role;
select 'Residency, ownership, occupancy, history, and announcement checks passed; fixture data will be rolled back.' as result;

rollback;

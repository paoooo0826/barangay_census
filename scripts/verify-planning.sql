-- Run after the two Nov 20 migrations, in a BEGIN/ROLLBACK transaction only.
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
reset role;
select pg_temp.become('admin');
update public.residents set barangay='Planning Fixture',submitted_at='2024-08-01T00:00:00Z',created_at='2024-08-01T00:00:00Z' where id in(select id from brims_test_ids);
update public.residents set civil_status='Married' where id=(select id from brims_test_ids where label='resident');
update public.residents set status='rejected',civil_status='Divorced' where id=(select id from brims_test_ids where label='other');
update public.boarder_stays set move_in_date='2024-01-05',departure_date='2024-01-10',status='moved_out' where resident_id=(select id from brims_test_ids where label='boarder');
insert into public.boarder_stays(boarding_house_id,resident_id,resident_name,tracking_number,move_in_date,departure_date,status,updated_by,updater_name)
select h.id,b.id,'Rollback Fixture','TEST-BOARDER','2024-01-20','2024-03-01','moved_out',a.id,'Rollback Staff' from brims_test_ids h cross join brims_test_ids b cross join brims_test_ids a where h.label='house' and b.label='boarder' and a.label='admin';
set local role authenticated;
do $test$
declare v jsonb; rev bigint;
begin
 perform pg_temp.become('resident');
 begin perform public.admin_planning_analytics();raise exception 'Resident accessed planning analytics';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.analytics_refresh_state) then raise exception 'Resident accessed analytics revision'; end if;
 perform pg_temp.become('admin');
 v:=public.admin_planning_analytics(2024,2025,'Planning Fixture',2024,'verified');
 if (select sum((x->>'count')::integer) from jsonb_array_elements(v->'civil') x)<>4 then raise exception 'Verified civil total incorrect';end if;
 if (select (x->>'count')::int from jsonb_array_elements(v->'civil') x where x->>'label'='Married')<>1 then raise exception 'Married group incorrect';end if;
 if jsonb_array_length(v->'monthly')<>24 then raise exception 'Comparison must have 24 months';end if;
 if not exists(select 1 from jsonb_array_elements(v->'monthly') x where x->>'year'='2024' and x->>'month'='1' and x->>'newBoarders'='1' and x->>'activeBoarders'='1') then raise exception 'Repeat stays counted twice';end if;
 if not exists(select 1 from jsonb_array_elements(v->'monthly') x where x->>'year'='2024' and x->>'month'='2' and x->>'newBoarders'='0' and x->>'activeBoarders'='1') then raise exception 'Active month overlap incorrect';end if;
 if not exists(select 1 from jsonb_array_elements(v->'monthly') x where x->>'year'='2024' and x->>'month'='3' and x->>'activeBoarders'='0') then raise exception 'Departure date treated as active';end if;
 if exists(select 1 from jsonb_array_elements(v->'annual') x where x->>'coverage'='complete') then raise exception 'Submission coverage was invented';end if;
 if (select (x->>'count')::int from jsonb_array_elements(v->'annual') x where x->>'year'='2024')<>4 then raise exception 'Annual count mismatch';end if;
 v:=public.admin_planning_analytics(2024,null,'Planning Fixture',2023,'verified');
 if (select sum((x->>'count')::int) from jsonb_array_elements(v->'civil') x)<>0 then raise exception 'Census year filter ignored';end if;
 select revision into rev from public.analytics_refresh_state;
 insert into public.announcements(title,message,priority,audience,is_published) values('Planning fixture notice','Ordinary explanatory text.','info','all',false);
 if (select revision from public.analytics_refresh_state)<=rev then raise exception 'Aggregate invalidation did not advance';end if;
 begin perform public.admin_planning_analytics(2099);raise exception 'Future year accepted';exception when invalid_parameter_value then null;end;
 begin insert into public.announcements(title,message,priority,audience,is_published) values('BWI$IT notice','Ordinary explanatory text.','info','all',false);raise exception 'Profanity bypassed database';exception when invalid_parameter_value then
   if sqlerrm not like 'Announcement title:%' then raise exception 'Moderation error did not identify field'; end if;
 end;
end $test$;
select true as planning_dates_filters_distinct_counts_privacy_and_moderation_passed;

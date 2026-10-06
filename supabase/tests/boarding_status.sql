begin;
create temporary table boarding_test_accounts(label text primary key,uid uuid,rid uuid,house_id uuid);
insert into boarding_test_accounts(label,uid,rid) select label,gen_random_uuid(),gen_random_uuid() from unnest(array['admin','owner','other_owner','boarder','neither']) label;
grant select,update on boarding_test_accounts to authenticated;
insert into auth.users(id,email) select uid,'boarding-test-'||uid||'@example.invalid' from boarding_test_accounts;
insert into public.residents(id,user_id,tracking_number,first_name,last_name,birth_date,birth_place,sex,civil_status,residential_address,tenurial_status,boarding_status,boarding_house_name,boarding_house_address,boarding_landlord_name,boarding_start_date,boarding_tenant_count,monthly_rent)
select rid,uid,'TEST-'||rid,'Fixture',label,'1990-01-01','Baguio','Male','Single','Test address','House Owner',
  case when label like '%owner' then 'landlord' when label='boarder' then 'boarder' else 'neither' end,
  'Test boarding house','Test address',case when label='boarder' then 'Test owner' end,
  case when label='boarder' then current_date-20 end,case when label like '%owner' then 0 end,
  case when label='boarder' then 0 end from boarding_test_accounts;
insert into public.admin_profiles(user_id,full_name,is_active) select uid,'Fixture admin',true from boarding_test_accounts where label='admin';
select set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'role','authenticated')::text from boarding_test_accounts where label='admin'),true);
set local role authenticated;
do $$ declare a record; h jsonb; failed boolean:=false; begin
  for a in select * from boarding_test_accounts where label like '%owner' loop
    h:=public.manage_boarding('save_house',jsonb_build_object('name','Test house '||a.label,'address','Test address','owner_resident_id',a.rid));
    update boarding_test_accounts set house_id=(h->>'id')::uuid where label=a.label;
  end loop;
  begin perform public.manage_boarding('save_house',jsonb_build_object('name','Invalid owner house','address','Test address','owner_resident_id',(select rid from boarding_test_accounts where label='neither')));
  exception when sqlstate '22023' then failed:=true; end;
  if not failed then raise exception 'FAIL: admin assigned a Neither resident as owner'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'role','authenticated')::text from boarding_test_accounts where label='owner'),true);
set local role authenticated;
do $$ declare h uuid; other_h uuid; s jsonb; failed boolean:=false; begin
  select house_id into h from boarding_test_accounts where label='owner';
  select house_id into other_h from boarding_test_accounts where label='other_owner';
  if (select count(*) from public.boarding_houses where id in(h,other_h))<>1 then raise exception 'FAIL: assigned owner house isolation'; end if;
  begin perform public.manage_boarding('move_in',jsonb_build_object('house_id',other_h,'tracking_number','TEST-'||(select rid from boarding_test_accounts where label='boarder'),'move_in_date',current_date-20));
  exception when insufficient_privilege then failed:=true; end;
  if not failed then raise exception 'FAIL: cross-house mutation'; end if;
  failed:=false;
  begin perform public.manage_boarding('move_in',jsonb_build_object('house_id',h,'tracking_number','TEST-'||(select rid from boarding_test_accounts where label='neither'),'move_in_date',current_date-20));
  exception when sqlstate '22023' then failed:=true; end;
  if not failed then raise exception 'FAIL: owner registered a non-boarder stay'; end if;
  s:=public.manage_boarding('move_in',jsonb_build_object('house_id',h,'tracking_number','TEST-'||(select rid from boarding_test_accounts where label='boarder'),'move_in_date',current_date-20));
  if s->>'status'<>'staying' then raise exception 'FAIL: assigned landlord cannot record move-in'; end if;
  perform public.manage_boarding('move_out',jsonb_build_object('stay_id',s->>'id','departure_date',current_date-10));
  s:=public.manage_boarding('move_in',jsonb_build_object('house_id',h,'tracking_number','TEST-'||(select rid from boarding_test_accounts where label='boarder'),'move_in_date',current_date-5));
end $$;
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'role','authenticated')::text from boarding_test_accounts where label='boarder'),true);
set local role authenticated;
do $$ declare r uuid; payload jsonb; saved jsonb; target text; failed boolean; begin
  select rid into r from boarding_test_accounts where label='boarder';
  if (select count(*) from public.boarder_stays where resident_id=r)<>2 then raise exception 'FAIL: boarder cannot see own stay history'; end if;
  if (select count(*) from public.boarding_houses where id in (select house_id from boarding_test_accounts where label like '%owner'))<>1 then raise exception 'FAIL: boarder sees unrelated house'; end if;
  failed:=false;
  begin perform public.manage_boarding('move_out',jsonb_build_object('stay_id',(select id from public.boarder_stays where resident_id=r and status='staying'),'departure_date',current_date));
  exception when insufficient_privilege then failed:=true; end;
  if not failed then raise exception 'FAIL: boarder accesses landlord management'; end if;
  select to_jsonb(x) into payload from public.residents x where x.id=r;
  payload:=payload||jsonb_build_object('boarding_house_name','Self-reported house','boarding_house_address','Self-reported address','boarding_landlord_name','Self-reported owner','boarding_start_date',current_date-5,'boarding_tenant_count',2,'boarding_contact','09123456789');
  foreach target in array array['neither','boarder','landlord','boarder','neither','landlord','neither','boarder','landlord'] loop
    saved:=public.save_resident_census(payload||jsonb_build_object('boarding_status',target,'monthly_rent',case when target='boarder' then 0 else null end),'[]',null,null);
    if saved->>'boarding_status'<>target or (select boarding_status from public.residents where id=r)<>target then raise exception 'FAIL: status transition not saved: %',target; end if;
    if target='neither' then
      if saved->>'boarding_house_name' is not null or saved->>'boarding_start_date' is not null or saved->>'boarding_tenant_count' is not null then raise exception 'FAIL: Neither retained current boarding fields'; end if;
      if exists(select 1 from public.boarder_stays where resident_id=r) or exists(select 1 from public.boarding_houses where id in(select house_id from boarding_test_accounts where label like '%owner')) then raise exception 'FAIL: Neither can query boarding data'; end if;
    elsif target='boarder' then
      if saved->>'boarding_tenant_count' is not null or saved->>'boarding_contact' is not null then raise exception 'FAIL: Boarder retained landlord fields'; end if;
      if (select count(*) from public.boarder_stays where resident_id=r)<>2 then raise exception 'FAIL: history not restored when returning to Boarder'; end if;
    else
      if saved->>'boarding_landlord_name' is not null or saved->>'boarding_start_date' is not null then raise exception 'FAIL: Landlord retained boarder fields'; end if;
      if exists(select 1 from public.boarder_stays where resident_id=r) then raise exception 'FAIL: Landlord accessed boarder-specific history'; end if;
      if exists(select 1 from public.boarding_houses where id in(select house_id from boarding_test_accounts where label like '%owner')) then raise exception 'FAIL: self-selected landlord gained an assignment'; end if;
    end if;
  end loop;
  failed:=false;
  begin perform public.save_resident_census(payload||jsonb_build_object('boarding_status','both'),'[]',null,null); exception when check_violation then failed:=true; end;
  if not failed then raise exception 'FAIL: invalid boarding status accepted'; end if;
  failed:=false;
  begin perform public.save_resident_census(payload||jsonb_build_object('boarding_status','boarder','boarding_house_name','','boarding_start_date',current_date+1),'[]',null,null); exception when sqlstate '22023' then failed:=true; end;
  if not failed then raise exception 'FAIL: missing or future boarder details accepted'; end if;
  failed:=false;
  begin perform public.save_resident_census(payload||jsonb_build_object('boarding_status','landlord','boarding_tenant_count',-1),'[]',null,null); exception when check_violation then failed:=true; end;
  if not failed then raise exception 'FAIL: negative tenant count accepted'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'role','authenticated')::text from boarding_test_accounts where label='owner'),true);
set local role authenticated;
do $$ declare r uuid; payload jsonb; target text; failed boolean; begin
  select rid into r from boarding_test_accounts where label='owner';
  select to_jsonb(x) into payload from public.residents x where x.id=r;
  foreach target in array array['neither','landlord','boarder','landlord'] loop
    perform public.save_resident_census(payload||jsonb_build_object('boarding_status',target,'boarding_landlord_name','Owner fixture','boarding_start_date',current_date-20),'[]',null,null);
    if target='landlord' then
      if not exists(select 1 from public.boarding_houses where owner_user_id=auth.uid()) then raise exception 'FAIL: assigned landlord access not restored'; end if;
    else
      if exists(select 1 from public.boarding_houses where owner_user_id=auth.uid()) then raise exception 'FAIL: former landlord retained assigned house access'; end if;
      failed:=false;
      begin perform public.manage_boarding('move_in',jsonb_build_object('house_id',(select house_id from boarding_test_accounts where label='owner'),'tracking_number','TEST-'||(select rid from boarding_test_accounts where label='boarder'),'move_in_date',current_date)); exception when insufficient_privilege then failed:=true; end;
      if not failed then raise exception 'FAIL: role change did not revoke management'; end if;
    end if;
  end loop;
end $$;
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'role','authenticated')::text from boarding_test_accounts where label='admin'),true);
set local role authenticated;
do $$ declare r uuid; begin
  select rid into r from boarding_test_accounts where label='boarder';
  if (select count(*) from public.boarder_stays where resident_id=r)<>2 or (select count(*) from public.boarder_occupancy_history where resident_id=r)<>3 then raise exception 'FAIL: occupancy history changed by census status'; end if;
  if not exists(select 1 from public.admin_resident_records where id=r and boarding_status='landlord' and search_text ilike '%Landlord/Landlady%') then raise exception 'FAIL: admin fields or boarding search missing'; end if;
end $$;
reset role;
set local role anon;
do $$ declare failed boolean:=false; begin
  begin perform * from public.boarding_houses; exception when insufficient_privilege then failed:=true; end;
  if not failed then raise exception 'FAIL: anonymous boarding access'; end if;
end $$;
reset role;
rollback;

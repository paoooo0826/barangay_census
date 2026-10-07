begin;
do $test$
declare
  actor uuid := gen_random_uuid();
  other_actor uuid := gen_random_uuid();
  admin_actor uuid;
  payload jsonb;
  evidence jsonb;
  identity jsonb;
  record_id uuid;
  result jsonb;
  baseline text;
  after_test text;
  path_prefix text;
  n integer;
begin
  select md5(coalesce(string_agg(to_jsonb(r)::text,'' order by id),'')) into baseline from public.residents r;
  select user_id into strict admin_actor from public.admin_profiles where is_active limit 1;
  insert into auth.users(id,email) values(actor,actor::text||'@test.invalid'),(other_actor,other_actor::text||'@test.invalid');
  path_prefix:=actor::text||'/security-test/';
  -- Storage metadata fixtures, not physical images. All fixtures roll back.
  insert into storage.objects(bucket_id,name,owner_id,metadata)
    select 'resident-verification',path_prefix||name,actor::text,
      '{"size":128,"mimetype":"image/jpeg"}'::jsonb
      from unnest(array['front.jpg','back.jpg','face.jpg','empty.jpg']) name;
  update storage.objects set metadata='{"size":0,"mimetype":"image/jpeg"}' where name=path_prefix||'empty.jpg';
  payload:=jsonb_build_object('first_name','Security','last_name',actor::text,'birth_date','2000-01-01',
    'birth_place','Baguio City','sex','Male','civil_status','Single','residential_address','Temporary test fixture',
    'region','CAR','province','Benguet','city_municipality','Baguio City','barangay','Old Lucban',
    'citizenship','Filipino','tenurial_status','Sharer');
  identity:=jsonb_build_object('id_type','PhilSys ID','front_image_url',path_prefix||'front.jpg','back_image_url',path_prefix||'back.jpg');
  evidence:=jsonb_build_object('captured_face_url',path_prefix||'face.jpg','liveness_passed',true,
    'verification_status','passed','verification_recommendation','manual_review',
    'liveness_actions','["blink_twice","turn_left","smile"]'::jsonb);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  begin
    perform public.save_resident_census(payload,'[]',null,null);
    raise exception 'FAIL: missing evidence accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_resident_census(payload,'[]','null'::jsonb,'null'::jsonb);
    raise exception 'FAIL: JSON null evidence accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_resident_census(payload,'[]',identity||jsonb_build_object('front_image_url',path_prefix||'missing.jpg'),evidence);
    raise exception 'FAIL: nonexistent file accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_resident_census(payload,'[]',identity||jsonb_build_object('front_image_url',path_prefix||'empty.jpg'),evidence);
    raise exception 'FAIL: empty file accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_resident_census(payload,'[]',identity,evidence||'{"liveness_passed":false}'::jsonb);
    raise exception 'FAIL: failed live capture accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_resident_census(payload,'[]',identity,evidence||jsonb_build_object('captured_face_url',other_actor::text||'/face.jpg'));
    raise exception 'FAIL: other user file accepted';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.residents(first_name,last_name,birth_date) values('Bypass','Attempt','2000-01-01');
    raise exception 'FAIL: direct insert bypass accepted';
  exception when insufficient_privilege then null; end;
  result:=public.save_resident_census(payload,'[]',identity,evidence);
  record_id:=(result->>'id')::uuid;
  if result->>'status'<>'verified' or not exists(select 1 from public.government_ids where resident_id=record_id)
      or not exists(select 1 from public.face_verifications where resident_id=record_id) then
    raise exception 'FAIL: validated new record did not preserve auto-approval and evidence';
  end if;
  begin
    update public.face_verifications set liveness_passed=false where resident_id=record_id;
    raise exception 'FAIL: verification evidence can be modified directly';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_dashboard_summary();
    raise exception 'FAIL: resident can access admin aggregates';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',admin_actor::text,true);
  perform public.review_resident(record_id,'reject','Security regression fixture', (select updated_at from public.residents where id=record_id));
  perform set_config('request.jwt.claim.sub',actor::text,true);
  result:=public.save_resident_census(payload||'{"contact_number":"09123456789"}'::jsonb,'[]',null,null);
  if result->>'status'<>'rejected' then raise exception 'FAIL: edit resets rejection'; end if;
  update public.residents set first_name='Updated',email_address='forged@test.invalid',status='verified' where id=record_id;
  if not exists(select 1 from public.residents where id=record_id and first_name='Updated'
      and status='rejected' and email_address=actor::text||'@test.invalid') then
    raise exception 'FAIL: direct update email/status protection or email lookup';
  end if;
  perform set_config('request.jwt.claim.sub',other_actor::text,true);
  if exists(select 1 from public.admin_resident_records where id=record_id) then raise exception 'FAIL: view bypasses ownership'; end if;
  perform set_config('request.jwt.claim.sub',admin_actor::text,true);
  perform public.review_resident(record_id,'approve','Security regression approval', (select updated_at from public.residents where id=record_id));
  result:=public.admin_dashboard_summary('active');
  if jsonb_array_length(result->'recentResidents')>5 then raise exception 'FAIL: recent list not bounded'; end if;
  result:=public.admin_census_analytics();
  select count(*) into n from public.residents where status='verified';
  if (result->>'total')::integer<>n then raise exception 'FAIL: analytics includes unapproved records'; end if;
  select count(*) into n from (select id from public.admin_resident_records order by updated_at desc,id limit 2) x;
  if n<>2 then raise exception 'FAIL: page limit'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role anon';
  begin
    perform public.save_resident_census(payload,'[]',identity,evidence);
    raise exception 'FAIL: anonymous RPC accepted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  select md5(coalesce(string_agg(to_jsonb(r)::text,'' order by id),'')) into after_test from public.residents r where id<>record_id;
  if baseline<>after_test then raise exception 'FAIL: existing records changed'; end if;
  perform set_config('census_security.result',jsonb_build_object(
    'missing_null_missing_file_empty_file_failed_live_other_owner','blocked',
    'direct_insert_evidence_write_and_anonymous_bypass','blocked',
    'validated_submission_and_auto_approval','pass','edits_preserve_rejection','pass',
    'direct_update_email_and_status_guards','pass','admin_approve_reject','pass',
    'paged_views_owner_isolation','pass','recent_five_and_approved_analytics','pass',
    'existing_records_unchanged','pass','fixtures','rolled back')::text,true);
end; $test$;
select current_setting('census_security.result')::jsonb as test_results;
rollback;

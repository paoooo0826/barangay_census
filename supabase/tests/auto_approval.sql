begin;

do $test$
declare
  resident_user uuid := gen_random_uuid();
  other_user uuid := gen_random_uuid();
  admin_user uuid := gen_random_uuid();
  record_id uuid;
  saved_tracking text;
  saved_submitted timestamptz;
  saved_created timestamptz;
  before_fingerprint text;
  after_fingerprint text;
  row_data public.residents%rowtype;
  affected integer;
begin
  select md5(coalesce(string_agg(to_jsonb(r)::text, '' order by id), ''))
    into before_fingerprint from public.residents r;

  insert into auth.users (id,email) values
    (resident_user,resident_user::text||'@test.invalid'),
    (other_user,other_user::text||'@test.invalid'),
    (admin_user,admin_user::text||'@test.invalid');
  insert into storage.objects(bucket_id,name,owner_id,metadata)
    select 'resident-verification',resident_user::text||'/approval-test/'||filename,resident_user::text,
      '{"size":128,"mimetype":"image/jpeg"}'::jsonb
    from unnest(array['front.jpg','back.jpg','face.jpg']) filename;
  insert into public.admin_profiles (user_id, full_name, is_active)
    values (admin_user, 'Temporary census deployment test', true);

  perform set_config('request.jwt.claim.sub', resident_user::text, true);
  execute 'set local role authenticated';

  select * into row_data from jsonb_populate_record(null::public.residents,
    public.save_resident_census(
      jsonb_build_object('first_name','Temporary','last_name',resident_user::text,'birth_date','2000-01-01',
        'birth_place','Baguio City','sex','Male','civil_status','Single','residential_address','Temporary test record',
        'region','CAR','province','Benguet','city_municipality','Baguio City','barangay','Old Lucban',
        'citizenship','Filipino','tenurial_status','Sharer'), '[]'::jsonb,
      jsonb_build_object('id_type','PhilSys ID','front_image_url',resident_user::text||'/approval-test/front.jpg',
        'back_image_url',resident_user::text||'/approval-test/back.jpg'),
      jsonb_build_object('captured_face_url',resident_user::text||'/approval-test/face.jpg',
        'liveness_passed',true,'verification_status','passed','verification_recommendation','manual_review',
        'liveness_actions','["blink_twice","turn_left","smile"]'::jsonb)));

  record_id := row_data.id;
  saved_tracking := row_data.tracking_number;
  saved_submitted := row_data.submitted_at;
  saved_created := row_data.created_at;

  if row_data.status <> 'verified' or row_data.verified_at is null
      or row_data.user_id <> resident_user then
    raise exception 'FAIL: new resident registration was not automatically approved';
  end if;

  perform set_config('request.jwt.claim.sub', other_user::text, true);
  if exists (select 1 from public.residents where id = record_id) then
    raise exception 'FAIL: another resident can read the census record';
  end if;
  update public.residents set first_name = 'Unauthorized' where id = record_id;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: another resident can update the census record';
  end if;

  perform set_config('request.jwt.claim.sub', resident_user::text, true);
  begin
    perform public.review_resident(record_id, 'reject', 'Unauthorized test');
    raise exception 'FAIL: resident can call administrator review';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', admin_user::text, true);
  begin
    perform public.review_resident(record_id, 'return', 'Removed action test');
    raise exception 'FAIL: removed return action was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.review_resident(record_id, 'reject', ' ');
    raise exception 'FAIL: rejection without a reason was accepted';
  exception when invalid_parameter_value then null;
  end;

  perform public.review_resident(record_id, 'reject', 'Temporary test rejection');
  select * into strict row_data from public.residents where id = record_id;
  if row_data.status <> 'rejected' or row_data.verified_at is not null then
    raise exception 'FAIL: administrator could not reject an approved record';
  end if;
  if (select count(*) from public.remarks where resident_id = record_id) <> 1
      or (select count(*) from public.notifications where resident_id = record_id) <> 1
      or (select count(*) from public.audit_logs where entity_id = record_id) <> 1 then
    raise exception 'FAIL: review did not save its remark, notification and audit together';
  end if;

  perform set_config('request.jwt.claim.sub', resident_user::text, true);
  update public.residents set
    first_name = 'Updated temporary',
    status = 'verified',
    verified_at = now(),
    user_id = other_user,
    tracking_number = 'FORGED-' || gen_random_uuid()::text,
    submitted_at = '2001-01-01',
    created_at = '2001-01-01'
  where id = record_id returning * into row_data;
  if row_data.first_name <> 'Updated temporary' or row_data.status <> 'rejected'
      or row_data.verified_at is not null or row_data.user_id <> resident_user
      or row_data.tracking_number <> saved_tracking
      or row_data.submitted_at <> saved_submitted or row_data.created_at <> saved_created then
    raise exception 'FAIL: resident editing changed protected review or ownership fields';
  end if;

  perform set_config('request.jwt.claim.sub', admin_user::text, true);
  perform public.review_resident(record_id, 'approve', 'Temporary test approval');
  if not exists (select 1 from public.residents where id = record_id
      and status = 'verified' and verified_at is not null) then
    raise exception 'FAIL: administrator could not approve after checking';
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  begin
    perform public.review_resident(record_id, 'approve', '');
    raise exception 'FAIL: anonymous caller can review records';
  exception when insufficient_privilege then null;
  end;

  execute 'reset role';
  select md5(coalesce(string_agg(to_jsonb(r)::text, '' order by id), ''))
    into after_fingerprint from public.residents r where id <> record_id;
  if before_fingerprint <> after_fingerprint then
    raise exception 'FAIL: an existing resident record changed during the test';
  end if;

  perform set_config('census_test.result', jsonb_build_object(
    'auto_approval', 'pass',
    'cross_resident_isolation', 'pass',
    'administrator_only_review', 'pass',
    'return_action_removed', 'pass',
    'rejection_reason_required', 'pass',
    'admin_rejection_and_atomic_history', 'pass',
    'resident_edit_preserves_rejection_and_ownership', 'pass',
    'admin_approval', 'pass',
    'anonymous_review_blocked', 'pass',
    'existing_records_unchanged', 'pass',
    'fixtures', 'rolled back'
  )::text, true);
end;
$test$;

select current_setting('census_test.result')::jsonb as test_results;
rollback;

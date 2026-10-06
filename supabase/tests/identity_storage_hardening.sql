begin;
do $test$
declare
  actor uuid := gen_random_uuid();
  other_actor uuid := gen_random_uuid();
  admin_actor uuid;
  first_record uuid;
  other_record uuid;
  prefix text;
  family text;
  baseline text;
  after_test text;
  amount integer;
  payload jsonb;
  identity jsonb;
  evidence jsonb;
  result jsonb;
  announcement_id uuid;
  visibility text;
begin
  select md5(string_agg(to_jsonb(r)::text,'|' order by id)) into baseline from public.residents r;
  select user_id into strict admin_actor from public.admin_profiles where is_active limit 1;
  insert into auth.users(id,email) values
    (actor,actor::text||'@test.invalid'),(other_actor,other_actor::text||'@test.invalid');
  family := 'Hardening '||actor::text;
  prefix := actor::text||'/hardening-test/';
  insert into public.residents(user_id,first_name,last_name,birth_date,birth_place,sex,civil_status,residential_address,tenurial_status,status)
    values(actor,'AuditA',family,'2000-01-01','Baguio','Male','Single','Test address','Sharer','verified')
    returning id into first_record;
  insert into public.residents(user_id,first_name,last_name,birth_date,birth_place,sex,civil_status,residential_address,tenurial_status,status)
    values(other_actor,'AuditB',family,'2000-01-01','Baguio','Male','Single','Test address','Sharer','verified')
    returning id into other_record;
  insert into storage.objects(bucket_id,name,owner_id,metadata)
    select 'resident-verification',prefix||file,actor::text,'{"size":128,"mimetype":"image/jpeg"}'::jsonb
    from unnest(array['front.jpg','back.jpg','face.jpg','draft.jpg','new-front.jpg','new-face.jpg']) file;
  insert into public.government_ids(resident_id,id_type,front_image_url,back_image_url)
    values(first_record,'PhilSys ID',prefix||'front.jpg',prefix||'back.jpg');
  insert into public.face_verifications(resident_id,captured_face_url,is_matched,liveness_passed,liveness_actions,verification_status,verification_recommendation)
    values(first_record,prefix||'face.jpg',false,true,'["blink_twice","turn_left","smile"]','passed','manual_review');

  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  begin
    update public.residents set first_name='  AuditB  ' where id=first_record;
    raise exception 'FAIL: direct identity duplicate update accepted';
  exception when unique_violation then null; end;
  if not exists(select 1 from public.residents where id=first_record and first_name='AuditA') then
    raise exception 'FAIL: rejected identity update changed the original';
  end if;
  result := public.check_resident_duplicate('', 'AuditB', '', family, '2000-01-01');
  if not coalesce((result->>'duplicate')::boolean,false) then
    raise exception 'FAIL: RPC and database trigger disagree';
  end if;
  update public.residents set contact_number='09123456789',status='rejected' where id=first_record;
  if not exists(select 1 from public.residents where id=first_record and contact_number='09123456789' and status='verified') then
    raise exception 'FAIL: legitimate edits or review-field protections changed';
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  update public.residents set middle_name='Known Alpha' where id=other_record;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  update public.residents set first_name='AuditB',middle_name='Known Beta' where id=first_record;
  begin
    update public.residents set middle_name=null where id=first_record;
    raise exception 'FAIL: unknown middle name bypasses duplicate detection';
  exception when unique_violation then null; end;
  begin
    update public.residents set first_name=' ' where id=first_record;
    raise exception 'FAIL: blank identity accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform 1 from private.resident_identity_locks;
    raise exception 'FAIL: resident can inspect internal lock keys';
  exception when insufficient_privilege then null; end;

  update storage.objects set metadata=metadata||'{"replacement":true}' where bucket_id='resident-verification' and name=prefix||'front.jpg';
  get diagnostics amount = row_count;
  if amount<>0 then raise exception 'FAIL: submitted front photo can be overwritten'; end if;
  update storage.objects set name=prefix||'renamed-back.jpg' where bucket_id='resident-verification' and name=prefix||'back.jpg';
  get diagnostics amount = row_count;
  if amount<>0 then raise exception 'FAIL: submitted back photo can be renamed'; end if;
  update storage.objects set metadata=metadata||'{"replacement":true}' where bucket_id='resident-verification' and name=prefix||'face.jpg';
  get diagnostics amount = row_count;
  if amount<>0 then raise exception 'FAIL: submitted face photo can be overwritten'; end if;
  perform set_config('storage.allow_delete_query','true',true);
  delete from storage.objects where bucket_id='resident-verification' and name=prefix||'face.jpg';
  get diagnostics amount = row_count;
  if amount<>0 then raise exception 'FAIL: submitted face photo can be deleted'; end if;
  update storage.objects set metadata=metadata||'{"replacement":true}' where bucket_id='resident-verification' and name=prefix||'draft.jpg';
  get diagnostics amount = row_count;
  if amount<>1 then raise exception 'FAIL: unused draft cannot be replaced'; end if;
  delete from storage.objects where bucket_id='resident-verification' and name=prefix||'draft.jpg';
  get diagnostics amount = row_count;
  if amount<>1 then raise exception 'FAIL: unused draft cannot be cleaned up'; end if;
  if (select count(*) from storage.objects where bucket_id='resident-verification' and name in (prefix||'front.jpg',prefix||'back.jpg',prefix||'face.jpg'))<>3 then
    raise exception 'FAIL: submitted photos cannot still be read by owner';
  end if;
  if private.verification_image_is_mutable('government-ids',prefix||'front.jpg')
     or private.verification_image_is_mutable('face-captures',prefix||'face.jpg') then
    raise exception 'FAIL: legacy buckets do not protect referenced paths';
  end if;

  select to_jsonb(r) into payload from public.residents r where id=first_record;
  identity := jsonb_build_object('id_type','PhilSys ID','front_image_url',prefix||'new-front.jpg','back_image_url',prefix||'back.jpg');
  evidence := jsonb_build_object('captured_face_url',prefix||'face.jpg','liveness_passed',true,
    'liveness_actions','["blink_twice","turn_left","smile"]'::jsonb,'verification_status','passed','verification_recommendation','manual_review');
  begin
    perform public.save_resident_census(payload,'[]',identity,null);
    raise exception 'FAIL: new ID photos accepted without new live verification';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_resident_census(payload,'[]',identity,evidence);
    raise exception 'FAIL: new ID photos accepted with reused live verification';
  exception when invalid_parameter_value then null; end;
  result := public.save_resident_census(payload,'[]',identity,evidence||jsonb_build_object('captured_face_url',prefix||'new-face.jpg'));
  if result->>'status'<>'verified' then raise exception 'FAIL: successful new verification lost auto-approval'; end if;
  update storage.objects set metadata=metadata||'{"replacement":true}' where bucket_id='resident-verification' and name=prefix||'new-face.jpg';
  get diagnostics amount = row_count;
  if amount<>0 then raise exception 'FAIL: replacement evidence is not locked'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  for visibility in select unnest(array['active','archived','future','expired','wrong-audience','unpublished']) loop
    insert into public.announcements(title,message,priority,audience,is_published,published_at,expires_at,archived,archived_at,image_path)
      values('Hardening '||visibility,'Temporary hardening verification content','info',
        case when visibility='wrong-audience' then 'rejected' else 'all' end,
        visibility<>'unpublished',
        case when visibility='future' then now()+interval '2 days' else now()-interval '2 days' end,
        case when visibility='expired' then now()-interval '1 day' else null end,
        visibility='archived',case when visibility='archived' then now() else null end,
        'hardening-'||actor::text||'/'||visibility||'.jpg') returning id into announcement_id;
    insert into storage.objects(bucket_id,name,owner_id,metadata)
      values('announcement-images','hardening-'||actor::text||'/'||visibility||'.jpg',admin_actor::text,'{"size":128,"mimetype":"image/jpeg"}');
  end loop;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  for visibility in select unnest(array['active','archived','future','expired','wrong-audience','unpublished']) loop
    if public.can_view_announcement_image('hardening-'||actor::text||'/'||visibility||'.jpg') <> (visibility='active') then
      raise exception 'FAIL: announcement helper visibility mismatch: %',visibility;
    end if;
    if exists(select 1 from storage.objects where bucket_id='announcement-images' and name='hardening-'||actor::text||'/'||visibility||'.jpg') <> (visibility='active') then
      raise exception 'FAIL: actual image RLS visibility mismatch: %',visibility;
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub',admin_actor::text,true);
  if (select count(*) from storage.objects where bucket_id='announcement-images' and name like 'hardening-'||actor::text||'/%')<>6 then
    raise exception 'FAIL: administrator cannot read archived/scheduled images';
  end if;
  update public.announcements set archived=false,archived_at=null where image_path='hardening-'||actor::text||'/archived.jpg';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  if not public.can_view_announcement_image('hardening-'||actor::text||'/archived.jpg') then
    raise exception 'FAIL: restored announcement image remains hidden';
  end if;
  execute 'reset role';
  select md5(string_agg(to_jsonb(r)::text,'|' order by id)) into after_test from public.residents r where id not in(first_record,other_record);
  if baseline<>after_test then raise exception 'FAIL: existing resident records changed'; end if;
  perform set_config('hardening.result',jsonb_build_object(
    'direct_duplicate_edits_and_missing_middle_name','blocked',
    'different_known_middle_names_and_contact_edits','allowed',
    'submitted_image_overwrite_rename_delete','blocked',
    'unused_draft_replacement_cleanup_and_own_reads','allowed',
    'replacement_ID_requires_new_live_verification','pass',
    'archived_scheduled_expired_wrong_audience_images','blocked',
    'active_restored_and_admin_image_access','pass',
    'existing_residents_unchanged','pass','fixtures','rolled back')::text,true);
end $test$;
select current_setting('hardening.result')::jsonb as test_results;
rollback;

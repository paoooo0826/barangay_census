-- Run inside the same rollback-only transaction as the verify-brims.sql fixtures,
-- after its DO block and before its final ROLLBACK. No fixture records persist.
create temp table community_feature_ids(own_history uuid default gen_random_uuid(),other_history uuid default gen_random_uuid());
insert into community_feature_ids default values;
insert into public.audit_logs(id,user_id,action,entity_type,entity_id,details)
select f.own_history,r.id,'census_updated','resident',r.id,'{"changes":{"residential_address":{"before":"Test old address","after":"Test new address"},"philsys_number":{"before":"test-secret","after":"test-secret-new"}}}' from community_feature_ids f cross join brims_test_ids r where r.label='resident';
insert into public.audit_logs(id,user_id,action,entity_type,entity_id,details)
select f.other_history,r.id,'census_updated','resident',r.id,'{}' from community_feature_ids f cross join brims_test_ids r where r.label='other';
grant select on community_feature_ids to authenticated;
set local role authenticated;
do $$
declare own uuid;other uuid;house uuid;history uuid;foreign_history uuid;report jsonb;again jsonb;feedback jsonb;feed jsonb;updated jsonb;key uuid:=gen_random_uuid();note_key uuid:=gen_random_uuid();old_version timestamptz;count_before bigint;
begin
 select id into own from brims_test_ids where label='resident';select id into other from brims_test_ids where label='other';select id into house from brims_test_ids where label='house';select own_history,other_history into history,foreign_history from community_feature_ids;
 perform pg_temp.become('resident');
 begin perform public.save_resident_update_feedback(own,history,'Forged administrator feedback',0,key);raise exception 'Resident wrote admin feedback';exception when insufficient_privilege then null;end;
 begin insert into public.resident_update_feedback(history_id,resident_id,user_id,admin_user_id,message,request_key) values(history,own,own,own,'Forged direct feedback',key);raise exception 'Resident directly inserted feedback';exception when insufficient_privilege then null;end;
 begin perform public.resident_record_history(other);raise exception 'Resident read another history';exception when insufficient_privilege then null;end;
 feed:=public.resident_record_history(own);
 if not exists(select 1 from jsonb_array_elements(feed->'items') x where x->>'id'=history::text) or feed::text like '%test-secret%' then raise exception 'Own history projection missing or exposes removed identity fields';end if;
 begin perform public.submit_resident_feedback('comment','This is fucking bad feedback.',gen_random_uuid());raise exception 'English profanity bypassed server';exception when invalid_parameter_value then null;end;
 begin perform public.submit_resident_feedback('comment','G@GO! This is an offensive comment.',gen_random_uuid());raise exception 'Tagalog profanity bypassed server';exception when invalid_parameter_value then null;end;
 perform public.submit_resident_feedback('suggestion','Improve class assistance near Putatan.',gen_random_uuid());
 perform public.submit_resident_feedback('suggestion','Please put a streetlight near the crossing.',gen_random_uuid());
 report:=public.submit_incident_with_location('disturbance','The person shouted "gago" during the reported disturbance.','Rollback Community Road',now()-interval '1 hour',array[]::text[],key,'Beside the test hall',16.42,120.59,15);
 if report->>'language_flagged'<>'true' or (report->>'latitude')::numeric<>16.42 or report->>'landmark'<>'Beside the test hall' then raise exception 'Quoted evidence/location not preserved or flagged';end if;
 again:=public.submit_incident_with_location('disturbance','The person shouted "gago" during the reported disturbance.','Rollback Community Road',now()-interval '1 hour',array[]::text[],key,'Beside the test hall',16.42,120.59,15);
 if report->>'id'<>again->>'id' then raise exception 'Location submission retry duplicated the report';end if;
 begin perform public.submit_incident_with_location('disturbance','The person shouted "gago" during the reported disturbance.','Rollback Community Road',now()-interval '1 hour',array[]::text[],key,'Changed landmark',16.42,120.59,15);raise exception 'Changed location retry accepted';exception when invalid_parameter_value then null;end;
 again:=public.submit_incident_with_location('other','A report with a precise optional coordinate pin.','Rollback Precise Location',now()-interval '1 hour',array[]::text[],gen_random_uuid(),'',16.4200001,120.5900001,null);
 perform public.submit_incident_with_location('other','A report with a precise optional coordinate pin.','Rollback Precise Location',now()-interval '1 hour',array[]::text[],(select request_key from public.incident_reports where id=(again->>'id')::uuid),'',16.4200001,120.5900001,null);
 begin perform public.submit_incident_with_location('other','A valid test report with missing longitude.','Rollback Test Road',now()-interval '1 hour',array[]::text[],gen_random_uuid(),'',16.42,null,null);raise exception 'Partial coordinates accepted';exception when invalid_parameter_value then null;end;
 begin perform public.submit_incident_with_location('other','A valid test report with invalid latitude.','Rollback Test Road',now()-interval '1 hour',array[]::text[],gen_random_uuid(),'',95,120,null);raise exception 'Out-of-range coordinates accepted';exception when invalid_parameter_value then null;end;
 old_version:=(report->>'updated_at')::timestamptz;
 updated:=public.add_incident_follow_up((report->>'id')::uuid,'The same person repeated "putang ina" near this location.',note_key);
 again:=public.add_incident_follow_up((report->>'id')::uuid,'The same person repeated "putang ina" near this location.',note_key);
 if updated->>'status'<>'submitted' or (select count(*) from public.community_case_updates where incident_id=(report->>'id')::uuid and request_key=note_key)<>1 or not exists(select 1 from public.community_case_updates where incident_id=(report->>'id')::uuid and request_key=note_key and language_flagged) then raise exception 'Follow-up retry, status preservation or evidence flag failed';end if;
 begin perform public.add_incident_follow_up((report->>'id')::uuid,'Changed retry content',note_key);raise exception 'Changed follow-up retry accepted';exception when invalid_parameter_value then null;end;
 perform pg_temp.become('other');
 if exists(select 1 from public.incident_reports where id=(report->>'id')::uuid) or exists(select 1 from public.community_case_updates where incident_id=(report->>'id')::uuid) then raise exception 'Another resident read incident evidence/history';end if;
 begin perform public.add_incident_follow_up((report->>'id')::uuid,'Foreign resident follow-up',gen_random_uuid());raise exception 'Another resident followed up';exception when insufficient_privilege then null;end;
 perform pg_temp.become('admin');
 begin perform public.review_community_case('incident',(report->>'id')::uuid,old_version,'under_review','Reviewing the new information.');raise exception 'Stale admin review overwrote a follow-up';exception when serialization_failure then null;end;
 begin perform public.review_community_case('incident',(report->>'id')::uuid,(updated->>'updated_at')::timestamptz,'under_review','');raise exception 'Progress without a note accepted';exception when invalid_parameter_value then null;end;
 begin perform public.add_incident_follow_up((report->>'id')::uuid,'You are fucking wrong.',gen_random_uuid());raise exception 'Offensive admin reply accepted';exception when invalid_parameter_value then null;end;
 updated:=public.review_community_case('incident',(report->>'id')::uuid,(updated->>'updated_at')::timestamptz,'under_review','Reviewing the additional information.');
 updated:=public.review_community_case('incident',(report->>'id')::uuid,(updated->>'updated_at')::timestamptz,'in_progress','A barangay action has been recorded.');
 updated:=public.review_community_case('incident',(report->>'id')::uuid,(updated->>'updated_at')::timestamptz,'resolved','The reported obstruction was addressed.');
 perform pg_temp.become('resident');
 updated:=public.add_incident_follow_up((report->>'id')::uuid,'Could you clarify the action taken?',gen_random_uuid());
 if updated->>'status'<>'resolved' then raise exception 'Resident follow-up silently reopened a closed report';end if;
 perform pg_temp.become('admin');
 updated:=public.add_incident_follow_up((report->>'id')::uuid,'The barangay cleared the reported area.',gen_random_uuid());
 if updated->>'status'<>'resolved' then raise exception 'Admin follow-up silently changed progress';end if;
 begin perform public.save_resident_update_feedback(own,foreign_history,'Feedback for a wrong record',0,gen_random_uuid());raise exception 'Feedback linked to another resident update';exception when invalid_parameter_value then null;end;
 begin perform public.save_resident_update_feedback(own,history,'Bobo ang update mo.',0,gen_random_uuid());raise exception 'Profane update feedback accepted';exception when invalid_parameter_value then null;end;
 feedback:=public.save_resident_update_feedback(own,history,'Please confirm your updated street address.',0,key);
 again:=public.save_resident_update_feedback(own,history,'Please confirm your updated street address.',0,key);
 if feedback->>'id'<>again->>'id' or (feedback->>'version')::int<>1 then raise exception 'Update feedback retry duplicated or changed version';end if;
 perform pg_temp.become('admin2');
 begin perform public.save_resident_update_feedback(own,history,'A stale edit from a second admin',0,gen_random_uuid());raise exception 'Stale feedback edit accepted';exception when serialization_failure then null;end;
 feedback:=public.save_resident_update_feedback(own,history,'Thank you for confirming the new street address.',1,gen_random_uuid());
 if (feedback->>'version')::int<>2 then raise exception 'Valid update feedback edit did not increment version';end if;
 perform pg_temp.become('resident');
 if not exists(select 1 from public.resident_update_feedback where history_id=history and message='Thank you for confirming the new street address.') then raise exception 'Resident cannot read own update feedback';end if;
 feed:=public.resident_notification_feed(own);
 if not exists(select 1 from jsonb_array_elements(feed->'items') x where x->>'title'='Feedback on Your Census Update') or not exists(select 1 from jsonb_array_elements(feed->'items') x where x->>'title'='Incident Follow-up Response') then raise exception 'Owner notifications missing';end if;
 perform pg_temp.become('other');
 if exists(select 1 from public.resident_update_feedback where history_id=history) then raise exception 'Feedback leaked to another resident';end if;
 perform pg_temp.become('admin');
 begin
  update public.appointments set admin_notes='This is fucking unacceptable.' where user_id=own;
  raise exception 'Offensive appointment notes accepted';
 exception when invalid_parameter_value then if sqlerrm not like '%offensive%' then raise;end if;end;
 begin
  perform public.review_resident(own,'reject','Bobo ang update mo.',(select updated_at from public.residents where id=own));
  raise exception 'Offensive resident review accepted';
 exception when invalid_parameter_value then if sqlerrm not like '%offensive%' then raise;end if;end;
 begin
  insert into public.announcements(title,message,priority,audience,is_published) values('Gago na announcement','An otherwise valid announcement message.','info','all',false);
  raise exception 'Offensive announcement accepted';
 exception when invalid_parameter_value then if sqlerrm not like '%offensive%' then raise;end if;end;
 perform pg_temp.become('landlord');
 begin perform public.send_boarding_message(house,'P.u.t.a! This is not respectful.',gen_random_uuid());raise exception 'Profane private message accepted';exception when invalid_parameter_value then null;end;
 if has_function_privilege('anon','public.add_incident_follow_up(uuid,text,uuid)','EXECUTE') or has_function_privilege('anon','public.save_resident_update_feedback(uuid,uuid,text,integer,uuid)','EXECUTE') then raise exception 'Anonymous user can execute new write APIs';end if;
end $$;
reset role;
update public.residents set boarding_status='neither',boarding_house_name=null,boarding_house_address=null,boarding_landlord_name=null,boarding_start_date=null,boarding_tenant_count=null,boarding_contact=null where id=(select id from brims_test_ids where label='landlord');
set local role authenticated;
do $$declare house uuid;owner_id uuid;feed jsonb;begin
 select id into house from brims_test_ids where label='house';select id into owner_id from brims_test_ids where label='landlord';
 perform pg_temp.become('landlord');
 if exists(select 1 from public.boarding_messages where boarding_house_id=house) or jsonb_array_length(public.boarding_conversations())<>0 then raise exception 'Former landlord can access conversation history';end if;
 begin perform public.send_boarding_message(house,'Former landlord message',gen_random_uuid());raise exception 'Former landlord can send';exception when insufficient_privilege then null;end;
 begin perform public.mark_boarding_conversation_read(house,now());raise exception 'Former landlord can mark messages read';exception when insufficient_privilege then null;end;
 feed:=public.resident_notification_feed(owner_id);
 if exists(select 1 from jsonb_array_elements(feed->'items') x where x->>'category'='message') or exists(select 1 from public.notifications where resident_id=owner_id and category='message') then raise exception 'Message notifications leaked after landlord access ended';end if;
 perform pg_temp.become('admin');
 if not exists(select 1 from jsonb_array_elements(public.boarding_conversations()) x where x->>'id'=house::text and x->>'can_send'='false') then raise exception 'Admin historical conversation is not read-only';end if;
 begin perform public.send_boarding_message(house,'Admin message to former landlord',gen_random_uuid());raise exception 'Admin sent to a resident without landlord access';exception when insufficient_privilege then null;end;
end $$;
reset role;

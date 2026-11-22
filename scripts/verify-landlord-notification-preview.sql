-- Run after the first 17 lines of verify-brims.sql, inside one BEGIN/ROLLBACK.
update public.residents set first_name=case when id=(select id from brims_test_ids where label='landlord') then 'Lina' else 'Mila' end,
 middle_name=null,last_name='Example',suffix=null where id in(select id from brims_test_ids where label in('landlord','landlord2'));
update public.boarding_houses set owner_name='Old Name Snapshot' where id in(select id from brims_test_ids where label in('house','house2'));
insert into public.admin_notifications(event_key,category,entity_id,title,message)
select 'rollback-unrelated:'||id::text,'incident',id,'Existing Incident','Existing incident notice unchanged' from brims_test_ids where label='incident';
set local role authenticated;
do $test$
declare h uuid:=(select id from brims_test_ids where label='house'); h2 uuid:=(select id from brims_test_ids where label='house2');
 key uuid:=gen_random_uuid(); msg jsonb; msg2 jsonb; again jsonb; long_message text; v jsonb; notice jsonb; actor uuid; before_unread bigint; ids uuid[];
begin
 perform pg_temp.become('admin');
 before_unread:=(public.admin_notification_feed(0,50,false)->>'unread_count')::bigint;
 perform pg_temp.become('landlord');
 msg:=public.send_boarding_message(h,E'Please check\n  the roof tomorrow.',key,true);
 again:=public.send_boarding_message(h,E'Please check\n  the roof tomorrow.',key,true);
 if msg->>'id'<>again->>'id' then raise exception 'Retry duplicated the saved message'; end if;
 if msg->>'body'<>E'Please check\n  the roof tomorrow.' then raise exception 'Preview normalization changed saved message'; end if;
 perform pg_temp.become('landlord2');
 long_message:=repeat('屋根 ',50);
 msg2:=public.send_boarding_message(h2,long_message,gen_random_uuid(),true);
 -- The admin was absent while both messages were saved: the feed must recover them.
 perform pg_temp.become('admin');
 v:=public.admin_notification_feed(0,50,false);
 if not exists(select 1 from jsonb_array_elements(v->'items') x where x->>'entity_id'=(select id::text from brims_test_ids where label='incident') and x->>'category'='incident' and x->>'message'='Existing incident notice unchanged') then raise exception 'Unrelated notification changed'; end if;
 if (v->>'unread_count')::bigint<>before_unread+2 then raise exception 'Offline messages did not add exactly two unread events'; end if;
 select x into notice from jsonb_array_elements(v->'items') x where x->>'entity_id'=h::text and x->>'category'='landlord_message';
 if notice->>'message' is distinct from 'Lina Example: Please check the roof tomorrow.' then raise exception 'Wrong landlord name or collapsed preview'; end if;
 if notice->>'created_at' is null or (notice->>'created_at')::timestamptz is distinct from (select created_at from public.admin_notifications where id=(notice->>'id')::uuid) then raise exception 'Missing or incorrect notification timestamp'; end if;
 if (notice->>'is_read')::boolean then raise exception 'New event already read'; end if;
 if (select count(*) from public.admin_notifications where event_key='message:'||(msg->>'id'))<>1 then raise exception 'Retry created duplicate notification'; end if;
 if (select message from public.admin_notifications where event_key='message:'||(msg->>'id'))<>'Lina Example: Please check the roof tomorrow.' then raise exception 'Stored event missing preview'; end if;
 select x into notice from jsonb_array_elements(v->'items') x where x->>'entity_id'=h2::text and x->>'category'='landlord_message';
 if notice->>'message' is distinct from 'Mila Example: '||left(trim(long_message),120)||'…' then raise exception 'Long Unicode preview not bounded correctly'; end if;
 if (select x->>'owner_name' from jsonb_array_elements(public.boarding_conversations()) x where x->>'id'=h::text)<>'Lina Example' or
 (select x->>'owner_name' from jsonb_array_elements(public.boarding_conversations()) x where x->>'id'=h2::text)<>'Mila Example' then raise exception 'Conversation names mixed or stale'; end if;
 -- Reconnect / repeated feed reads never create new event rows or local-only unread state.
 perform pg_temp.become('admin'); perform public.admin_notification_feed(0,50,false); perform public.admin_notification_feed(0,50,false);
 if (public.admin_notification_feed(0,50,false)->>'unread_count')::bigint<>before_unread+2 then raise exception 'Refresh duplicated unread state'; end if;
 perform public.mark_boarding_conversation_read(h,(msg->>'created_at')::timestamptz);
 if (public.admin_notification_feed(0,50,false)->>'unread_count')::bigint<>before_unread+1 then raise exception 'Read cleared wrong conversation or did not persist'; end if;
 if not exists(select 1 from jsonb_array_elements(public.admin_notification_feed(0,50,true)->'items') x where x->>'entity_id'=h2::text) then raise exception 'Other landlord unread notification disappeared'; end if;
 -- Replies retain their existing resident notification behavior.
 msg:=public.send_boarding_message(h,'Thanks, we will inspect the roof.',gen_random_uuid(),false);
 perform pg_temp.become('landlord');
 if not exists(select 1 from jsonb_array_elements(public.resident_notification_feed(auth.uid(),0,50)->'items') x where x->>'related_entity_id'=h::text) then raise exception 'Admin reply no longer notifies landlord'; end if;
 begin perform public.send_boarding_message(h,'IdIoT',gen_random_uuid(),true); raise exception 'Rejected message was accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.send_boarding_message(h,'A failed request.',null,true); raise exception 'Invalid request was accepted'; exception when invalid_parameter_value then null; end;
 perform pg_temp.become('admin');
 if (select count(*) from public.admin_notifications where category='landlord_message' and entity_id in(h,h2))<>2 then raise exception 'Failed send created an event'; end if;
 -- Scope remains the existing active-admin audience, with independent read receipts.
 perform pg_temp.become('admin2');
 if not exists(select 1 from jsonb_array_elements(public.admin_notification_feed(0,50,true)->'items') x where x->>'entity_id'=h::text) then raise exception 'Admin read states were merged'; end if;
 for actor in select id from brims_test_ids where label in('resident','other','landlord2') loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true); perform set_config('request.jwt.claim.sub',actor::text,true);
  if exists(select 1 from public.boarding_message_feed where boarding_house_id=h) or exists(select 1 from public.admin_notifications where entity_id in(h,h2)) then raise exception 'Private messages or notifications exposed'; end if;
  begin perform public.admin_notification_feed(0,50,false); raise exception 'Non-admin read admin feed'; exception when insufficient_privilege then null; end;
 end loop;
end $test$;
reset role;
-- Older generic notification records render a preview without rewriting stored history.
update public.admin_notifications set message='Legacy generic notice' where entity_id=(select id from brims_test_ids where label='house2') and category='landlord_message';
update public.residents set first_name='Mila Updated' where id=(select id from brims_test_ids where label='landlord2');
set local role authenticated;
do $test$ declare h uuid:=(select id from brims_test_ids where label='house2'); v jsonb; begin
 perform pg_temp.become('admin');
 select x into v from jsonb_array_elements(public.admin_notification_feed(0,50,false)->'items') x where x->>'entity_id'=h::text and x->>'category'='landlord_message';
 if v->>'message' not like 'Mila Updated Example: 屋根 %' then raise exception 'Legacy notice or current profile name failed'; end if;
 if (select message from public.admin_notifications where entity_id=h and category='landlord_message')<>'Legacy generic notice' then raise exception 'Reading feed rewrote legacy records'; end if;
end $test$;
reset role;
select 'Landlord notification previews, current profile names, Unicode bounds, offline persistence, replies, receipts and privacy passed' as verification;

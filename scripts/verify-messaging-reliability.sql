-- Run after the staged migrations and first 17 fixture lines of verify-brims.sql,
-- inside a single transaction that is always rolled back.
update public.admin_profiles set full_name=case when user_id=(select id from brims_test_ids where label='admin') then 'Admin Ana Example' else 'Admin Ben Example' end
 where user_id in(select id from brims_test_ids where label in('admin','admin2'));
insert into public.admin_profiles(user_id,full_name,is_active) select id,'Dual Role Admin',true from brims_test_ids where label='landlord';
set local role authenticated;
do $$
declare h uuid; h2 uuid; a uuid; owner uuid; key uuid:=gen_random_uuid(); sent jsonb; again jsonb; reply jsonb; latest jsonb; msg uuid; n integer; read_at timestamptz; name text;
begin
 select id into h from brims_test_ids where label='house'; select id into h2 from brims_test_ids where label='house2';
 select id into a from brims_test_ids where label='admin'; select id into owner from brims_test_ids where label='landlord';
 perform pg_temp.become('landlord');
 sent:=public.send_boarding_message(h,'Hello, the book and good records are ready.',key,true);
 if sent->>'sender_role'<>'landlord' or (sent->>'sender_user_id')::uuid<>owner then raise exception 'Dual-role landlord context was lost'; end if;
 again:=public.send_boarding_message(h,'Hello, the book and good records are ready.',key,true);
 if sent->>'id'<>again->>'id' then raise exception 'Retry created duplicate message'; end if;
 msg:=(sent->>'id')::uuid;
 if exists(select 1 from public.admin_notifications where event_key='message:'||msg::text) then raise exception 'Sender received own admin notification'; end if;
 if exists(select 1 from jsonb_array_elements(public.admin_notification_feed(0,50,false)->'items') x where x->>'entity_id'=h::text) then raise exception 'Sender feed contains own event'; end if;
 if exists(select 1 from public.notifications where related_entity_id=h) then raise exception 'Landlord send notified owner'; end if;
 perform pg_temp.become('admin');
 select count(*) into n from public.admin_notifications where event_key='message:'||msg::text;
 if n<>1 then raise exception 'Landlord notification missing or duplicated'; end if;
 if (select count(*) from public.boarding_messages where boarding_house_id=h)<>1 then raise exception 'Retry duplicate message'; end if;
 select sender_name into name from public.boarding_message_feed where id=msg;
 if name<>sent->>'sender_name' or name='Admin' then raise exception 'Landlord profile name lost'; end if;
 if not exists(select 1 from jsonb_array_elements(public.admin_notification_feed(0,50,false)->'items') x where x->>'entity_id'=h::text and not (x->>'is_read')::boolean and position(name in x->>'message')>0) then raise exception 'Admin feed lacks named unread event'; end if;
 -- A boundary before the message cannot swallow the event.
 perform public.mark_boarding_conversation_read(h,(sent->>'created_at')::timestamptz-interval '1 microsecond');
 if exists(select 1 from public.admin_notification_reads r join public.admin_notifications e on e.id=r.notification_id where e.event_key='message:'||msg::text) then raise exception 'Read boundary swallowed unseen message'; end if;
 perform public.mark_boarding_conversation_read(h,(sent->>'created_at')::timestamptz);
 perform public.mark_boarding_conversation_read(h,(sent->>'created_at')::timestamptz);
 if (select count(*) from public.admin_notification_reads r join public.admin_notifications e on e.id=r.notification_id where e.event_key='message:'||msg::text and r.user_id=a)<>1 then raise exception 'Read receipt missing or duplicated'; end if;
 if exists(select 1 from jsonb_array_elements(public.admin_notification_feed(0,50,true)->'items') x where x->>'entity_id'=h::text) then raise exception 'Read event still unread'; end if;
 if exists(select 1 from jsonb_array_elements(public.boarding_conversations()) x where x->>'id'=h::text and (x->>'unread_count')::integer<>0) then raise exception 'Chat badge disagrees after read'; end if;
 reply:=public.send_boarding_message(h,'Good morning. Your book is ready.',gen_random_uuid(),false);
 if reply->>'sender_name'<>'Admin Ana Example' then raise exception 'Wrong sending admin name'; end if;
 begin perform public.send_boarding_message(h,'Pretend owner',gen_random_uuid(),true); raise exception 'Admin impersonated landlord'; exception when insufficient_privilege then null; end;
 perform pg_temp.become('admin2');
 if not exists(select 1 from jsonb_array_elements(public.admin_notification_feed(0,50,true)->'items') x where x->>'entity_id'=h::text) then raise exception 'Admin read receipt leaked between admins'; end if;
 latest:=public.send_boarding_message(h,'Hello from another administrator.',gen_random_uuid(),false);
 if latest->>'sender_name'<>'Admin Ben Example' then raise exception 'Profile resolution uses current viewer or wrong admin'; end if;
 perform pg_temp.become('landlord');
 if (select count(*) from public.notifications where related_entity_id=h and not is_read)<>2 then raise exception 'Admin replies not notified exactly once'; end if;
 if (select sender_name from public.boarding_message_feed where id=(reply->>'id')::uuid)<>'Admin Ana Example' then raise exception 'Incoming admin incorrectly displayed as owner'; end if;
 if not exists(select 1 from jsonb_array_elements(public.resident_notification_feed(owner,0,50)->'items') x where position('Admin Ben Example' in x->>'message')>0) then raise exception 'Resident notification lacks actual admin name'; end if;
 if not exists(select 1 from jsonb_array_elements(public.boarding_conversations()) x where x->>'id'=h::text and x->>'latest_sender_name'='Admin Ben Example' and x->>'latest_body'='Hello from another administrator.') then raise exception 'Conversation preview lost author'; end if;
 -- Simulate reload / another JWT session: unread state is stored, not local UI state.
 perform pg_temp.become('landlord');
 if (select count(*) from jsonb_array_elements(public.boarding_conversations()) x where x->>'id'=h::text and (x->>'unread_count')::integer=2)<>1 then raise exception 'Unread messages did not persist'; end if;
 perform public.mark_boarding_conversation_read(h,(reply->>'created_at')::timestamptz);
 if (select count(*) from public.notifications where related_entity_id=h and not is_read)<>1 then raise exception 'Read boundary swallowed later admin reply'; end if;
 perform public.mark_boarding_conversation_read(h,(latest->>'created_at')::timestamptz);
 if exists(select 1 from public.notifications where related_entity_id=h and not is_read) then raise exception 'Viewed replies remain unread'; end if;
 if exists(select 1 from jsonb_array_elements(public.boarding_conversations()) x where x->>'id'=h::text and (x->>'unread_count')::integer<>0) then raise exception 'Resident badges disagree after viewing'; end if;
 -- Both roles share the same trusted moderation before any insert or event.
 for name in select jsonb_array_elements_text('["idiot","IdIoT","IIIIDDDDIIIIOOOOTTTT","iiiiddddiiiiooootttt","i.d.i.o.t","i d i o t","Idiots!","GAAAAGOOO","putaaang ina mo"]'::jsonb) loop
  begin perform public.send_boarding_message(h,name,gen_random_uuid(),true); raise exception 'Blocked landlord message saved'; exception when invalid_parameter_value then null; end;
 end loop;
 perform pg_temp.become('admin');
 begin perform public.send_boarding_message(h,'IIIIDDDDIIIIOOOOTTTT',gen_random_uuid(),false); raise exception 'Blocked admin message saved'; exception when invalid_parameter_value then null; end;
 if (select count(*) from public.boarding_messages where boarding_house_id=h)<>3 then raise exception 'Blocked messages were persisted'; end if;
 if (select count(*) from public.admin_notifications where entity_id=h and category='landlord_message')<>1 or (select count(*) from public.notifications where related_entity_id=h and category='message')<>1 then raise exception 'Blocked or retried message created notification'; end if;
 perform pg_temp.become('landlord');
 sent:=public.send_boarding_message(h,'Admin-panel note on my own property.',gen_random_uuid(),false);
 if sent->>'sender_name'<>'Dual Role Admin' or sent->>'sender_role'<>'admin' then raise exception 'Dual-role admin identity lost'; end if;
 if exists(select 1 from public.notifications where event_key='message:'||(sent->>'id')) then raise exception 'Admin reply notified its own owner account'; end if;
 -- RLS and direct-RPC / helper access use the same participant restrictions.
 for name in select unnest(array['resident','boarder','other','landlord2']) loop
  perform pg_temp.become(name);
  if exists(select 1 from public.boarding_messages where boarding_house_id=h) or exists(select 1 from public.boarding_message_feed where boarding_house_id=h) then raise exception 'Unrelated user read private messages'; end if;
  if private.boarding_message_sender_name(msg) is not null then raise exception 'Sender helper exposed another conversation'; end if;
  if exists(select 1 from public.notifications where related_entity_id=h) or exists(select 1 from public.admin_notifications where entity_id=h) then raise exception 'Unrelated user read private notifications'; end if;
  begin perform public.send_boarding_message(h,'Unauthorised',gen_random_uuid(),true); raise exception 'Unrelated user wrote message'; exception when insufficient_privilege then null; end;
  begin perform public.mark_boarding_conversation_read(h,clock_timestamp()); raise exception 'Unrelated user wrote read receipt'; exception when insufficient_privilege then null; end;
  begin perform public.resident_notification_feed(owner,0,50); raise exception 'Unrelated user fetched recipient feed'; exception when insufficient_privilege then null; end;
 end loop;
 perform pg_temp.become('landlord2');
 begin perform public.send_boarding_message(h2,'Forged admin',gen_random_uuid(),false); raise exception 'Landlord became admin'; exception when insufficient_privilege then null; end;
 begin insert into public.boarding_messages(boarding_house_id,sender_user_id,sender_role,body,request_key) values(h2,owner,'admin','Direct write',gen_random_uuid()); raise exception 'Direct write bypassed trusted RPC'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$declare h uuid:=(select id from brims_test_ids where label='house'); begin
 if (select count(*) from public.admin_notifications where entity_id=h and category='landlord_message')<>1 or
 (select count(*) from public.notifications where related_entity_id=h and category='message')<>2 then raise exception 'Persisted notification rows duplicated or created for rejected messages'; end if;
end $$;
-- A missing admin name falls back to Admin while keeping stored message bodies intact.
update public.admin_profiles set full_name=' ' where user_id=(select id from brims_test_ids where label='admin');
set local role authenticated;
do $$declare value jsonb; begin
 perform pg_temp.become('admin');
 value:=public.send_boarding_message((select id from brims_test_ids where label='house'),'Hello, book, good.',gen_random_uuid(),false);
 if value->>'sender_name'<>'Admin' or value->>'body'<>'Hello, book, good.' then raise exception 'Fallback or unmodified original text failed'; end if;
end $$;
reset role;
select 'Messaging role, author names, moderation, recipient routing, retries, read persistence and access tests passed' as verification;

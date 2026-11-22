-- Add bounded message previews using the existing message identity and notification event.
-- No schema, role, grant, policy, read-state, or existing record changes.
-- Legacy events are rendered from their saved message without backfilling notification rows.
CREATE OR REPLACE FUNCTION private.brims_send_message(p_house uuid, p_body text, p_request_key uuid, p_as_landlord boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); saved public.boarding_messages; house public.boarding_houses; role_name text; name text;
begin
 if not private.boarding_chat_access(p_house) then raise exception 'This conversation is unavailable to your account.' using errcode='42501'; end if;
 if p_request_key is null or length(trim(coalesce(p_body,''))) not between 1 and 4000 then raise exception 'Write a message with 1 to 4000 characters.' using errcode='22023'; end if;
 if private.contains_profanity(p_body) then raise exception 'Message: Please remove inappropriate language before sending. Your draft has been kept for editing.' using errcode='22023'; end if;
 select * into house from public.boarding_houses where id=p_house;
 if not exists(select 1 from public.residents r where r.id=house.owner_resident_id and r.user_id=house.owner_user_id and r.boarding_status='landlord') or (select r.boarding_status from public.residents r where r.user_id=house.owner_user_id order by r.updated_at desc nulls last,r.id limit 1) is distinct from 'landlord' then raise exception 'The assigned owner no longer has landlord access. This conversation is read-only for administrators.' using errcode='42501'; end if;
 if coalesce(p_as_landlord,house.owner_user_id=actor) then
  if house.owner_user_id is distinct from actor then raise exception 'Only the assigned landlord may send from the landlord panel.' using errcode='42501'; end if;
  role_name:='landlord';
 else
  if not public.is_active_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
  role_name:='admin';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':message:'||p_request_key::text,0));
 select * into saved from public.boarding_messages where sender_user_id=actor and request_key=p_request_key;
 if found then
  if saved.boarding_house_id<>p_house or saved.body<>trim(p_body) or saved.sender_role<>role_name then raise exception 'Message retry does not match the original.' using errcode='22023'; end if;
  return to_jsonb(saved)||jsonb_build_object('sender_name',private.boarding_message_sender_name(saved.id));
 end if;
 insert into public.boarding_messages(boarding_house_id,sender_user_id,sender_role,body,request_key)
 values(p_house,actor,role_name,trim(p_body),p_request_key) returning * into saved;
 name:=private.boarding_message_sender_name(saved.id);
 if role_name='landlord' then
  perform private.brims_admin_event('message:'||saved.id::text,'landlord_message',p_house,'New Landlord Message',name||': '||left(regexp_replace(saved.body,'[[:space:]]+',' ','g'),120)||case when length(regexp_replace(saved.body,'[[:space:]]+',' ','g'))>120 then '…' else '' end);
 elsif house.owner_user_id is distinct from actor then
  perform private.brims_resident_event('message:'||saved.id::text,house.owner_resident_id,'message',p_house,'New Barangay Message',name||' sent a message about '||house.name||'.');
 end if;
 return to_jsonb(saved)||jsonb_build_object('sender_name',name);
end $function$
;
CREATE OR REPLACE FUNCTION private.brims_admin_feed(p_offset integer, p_limit integer, p_unread_only boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); result jsonb;
begin
 if actor is null or not public.is_active_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid notification page.' using errcode='22023'; end if;
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from (
   select n.id,n.category,n.entity_id,n.title,case when n.category='landlord_message' then coalesce((select private.boarding_message_sender_name(m.id)||': '||left(regexp_replace(m.body,'[[:space:]]+',' ','g'),120)||case when length(regexp_replace(m.body,'[[:space:]]+',' ','g'))>120 then '…' else '' end from public.boarding_messages m where n.event_key='message:'||m.id::text and m.boarding_house_id=n.entity_id),'Landlord/Landlady') else n.message end as message,n.created_at,exists(select 1 from public.admin_notification_reads r where r.notification_id=n.id and r.user_id=actor) as is_read
   from public.admin_notifications n where (n.category<>'landlord_message' or private.boarding_message_notification_visible(n.event_key,n.entity_id)) and (not coalesce(p_unread_only,false) or not exists(select 1 from public.admin_notification_reads r where r.notification_id=n.id and r.user_id=actor))
   order by n.created_at desc,n.id desc limit p_limit offset p_offset) x),'[]'::jsonb),
   'unread_count',(select count(*) from public.admin_notifications n where (n.category<>'landlord_message' or private.boarding_message_notification_visible(n.event_key,n.entity_id)) and not exists(select 1 from public.admin_notification_reads r where r.notification_id=n.id and r.user_id=actor)),
   'total',(select count(*) from public.admin_notifications n where (n.category<>'landlord_message' or private.boarding_message_notification_visible(n.event_key,n.entity_id)) and (not coalesce(p_unread_only,false) or not exists(select 1 from public.admin_notification_reads r where r.notification_id=n.id and r.user_id=actor)))) into result;
 return result;
end $function$
;

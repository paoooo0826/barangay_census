-- Resolve display names only through an authorized message; never expose the admin directory.
create or replace function private.boarding_message_sender_name(p_message uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare m public.boarding_messages; name text;
begin
 select * into m from public.boarding_messages where id=p_message;
 if not found or not private.boarding_chat_access(m.boarding_house_id) then return null; end if;
 if m.sender_role='admin' then
  select nullif(trim(a.full_name),'') into name from public.admin_profiles a where a.user_id=m.sender_user_id;
  return coalesce(name,'Admin');
 end if;
 select nullif(trim(concat_ws(' ',nullif(trim(r.first_name),''),nullif(trim(r.middle_name),''),nullif(trim(r.last_name),''),nullif(trim(r.suffix),''))),'') into name
 from public.residents r where r.user_id=m.sender_user_id order by r.updated_at desc nulls last,r.id limit 1;
 return coalesce(name,'Landlord/Landlady');
end $$;
revoke all on function private.boarding_message_sender_name(uuid) from public,anon;
grant execute on function private.boarding_message_sender_name(uuid) to authenticated;

create or replace view public.boarding_message_feed with (security_invoker=true) as
 select m.id,m.boarding_house_id,m.sender_user_id,m.sender_role,m.body,m.created_at,
 private.boarding_message_sender_name(m.id) as sender_name from public.boarding_messages m;
revoke all on public.boarding_message_feed from public,anon;
grant select on public.boarding_message_feed to authenticated;

-- Shared predicate for API feeds and RLS, including Postgres Changes delivery.
create or replace function private.boarding_message_notification_visible(p_key text,p_house uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.boarding_chat_access(p_house) and exists(select 1 from public.boarding_messages m
 where 'message:'||m.id::text=p_key and m.boarding_house_id=p_house and m.sender_user_id<>auth.uid());
$$;
revoke all on function private.boarding_message_notification_visible(text,uuid) from public,anon;
grant execute on function private.boarding_message_notification_visible(text,uuid) to authenticated;
create policy message_event_participants on public.admin_notifications as restrictive for select to authenticated
 using(category<>'landlord_message' or private.boarding_message_notification_visible(event_key,entity_id));
drop policy current_landlord_message_notifications on public.notifications;
create policy current_landlord_message_notifications on public.notifications as restrictive for select to authenticated
 using(category<>'message' or private.boarding_message_notification_visible(event_key,related_entity_id));

-- Explicit panel context resolves dual-role accounts; the server still authorizes each role.
create or replace function private.brims_send_message(p_house uuid,p_body text,p_request_key uuid,p_as_landlord boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
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
  perform private.brims_admin_event('message:'||saved.id::text,'landlord_message',p_house,'New Landlord Message',name||' sent a message about '||house.name||'.');
 elsif house.owner_user_id is distinct from actor then
  perform private.brims_resident_event('message:'||saved.id::text,house.owner_resident_id,'message',p_house,'New Barangay Message',name||' sent a message about '||house.name||'.');
 end if;
 return to_jsonb(saved)||jsonb_build_object('sender_name',name);
end $$;
-- Preserve the old three-argument API for already-open clients.
create or replace function private.brims_send_message(p_house uuid,p_body text,p_request_key uuid)
returns jsonb language sql security definer set search_path='' as $$select private.brims_send_message(p_house,p_body,p_request_key,null)$$;
create or replace function public.send_boarding_message(p_house_id uuid,p_body text,p_request_key uuid,p_as_landlord boolean)
returns jsonb language sql set search_path='' as $$select private.brims_send_message(p_house_id,p_body,p_request_key,p_as_landlord)$$;
revoke all on function private.brims_send_message(uuid,text,uuid,boolean),public.send_boarding_message(uuid,text,uuid,boolean) from public,anon;
grant execute on function private.brims_send_message(uuid,text,uuid,boolean),public.send_boarding_message(uuid,text,uuid,boolean) to authenticated;

-- Conversation reads clear only matching incoming notification receipts through the viewed boundary.
create or replace function private.brims_mark_conversation(p_house uuid,p_through timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.boarding_chat_access(p_house) then raise exception 'This conversation is unavailable to your account.' using errcode='42501'; end if;
 if p_through is null or p_through>clock_timestamp() then raise exception 'Invalid message read boundary.' using errcode='22023'; end if;
 insert into public.boarding_conversation_reads(boarding_house_id,user_id,read_at) values(p_house,auth.uid(),p_through)
 on conflict(boarding_house_id,user_id) do update set read_at=greatest(boarding_conversation_reads.read_at,excluded.read_at) where boarding_conversation_reads.read_at<excluded.read_at;
 if public.is_active_admin() then
  insert into public.admin_notification_reads(notification_id,user_id)
  select n.id,auth.uid() from public.admin_notifications n join public.boarding_messages m on n.event_key='message:'||m.id::text
  where n.category='landlord_message' and n.entity_id=p_house and m.boarding_house_id=p_house and m.sender_user_id<>auth.uid() and m.created_at<=p_through
  on conflict do nothing;
 end if;
 update public.notifications n set is_read=true from public.boarding_messages m
 where n.event_key='message:'||m.id::text and n.category='message' and n.related_entity_id=p_house and m.boarding_house_id=p_house
 and m.sender_user_id<>auth.uid() and m.created_at<=p_through and not coalesce(n.is_read,false)
 and exists(select 1 from public.residents r where r.id=n.resident_id and r.user_id=auth.uid());
end $$;

-- Every live table retains its existing per-account / participant SELECT policy.
create or replace function private.brims_mark_admin_notifications(p_ids uuid[]) returns integer
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
 insert into public.admin_notification_reads(notification_id,user_id)
 select id,auth.uid() from public.admin_notifications where (p_ids is null or id=any(p_ids))
 and (category<>'landlord_message' or private.boarding_message_notification_visible(event_key,entity_id)) on conflict do nothing;
 get diagnostics affected=row_count; return affected;
end $$;
do $$declare relation text; begin
 foreach relation in array array['boarding_messages','boarding_conversation_reads','notifications','admin_notification_reads'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=relation) then
   execute format('alter publication supabase_realtime add table public.%I',relation);
  end if;
 end loop;
end $$;

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
   select n.id,n.category,n.entity_id,n.title,case when n.category='landlord_message' then coalesce((select private.boarding_message_sender_name(m.id) from public.boarding_messages m where n.event_key='message:'||m.id::text),'Landlord/Landlady')||' sent a boarding house message.' else n.message end as message,n.created_at,exists(select 1 from public.admin_notification_reads r where r.notification_id=n.id and r.user_id=actor) as is_read
   from public.admin_notifications n where (n.category<>'landlord_message' or private.boarding_message_notification_visible(n.event_key,n.entity_id)) and (not coalesce(p_unread_only,false) or not exists(select 1 from public.admin_notification_reads r where r.notification_id=n.id and r.user_id=actor))
   order by n.created_at desc,n.id desc limit p_limit offset p_offset) x),'[]'::jsonb),
   'unread_count',(select count(*) from public.admin_notifications n where (n.category<>'landlord_message' or private.boarding_message_notification_visible(n.event_key,n.entity_id)) and not exists(select 1 from public.admin_notification_reads r where r.notification_id=n.id and r.user_id=actor)),
   'total',(select count(*) from public.admin_notifications n where (n.category<>'landlord_message' or private.boarding_message_notification_visible(n.event_key,n.entity_id)) and (not coalesce(p_unread_only,false) or not exists(select 1 from public.admin_notification_reads r where r.notification_id=n.id and r.user_id=actor)))) into result;
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION private.brims_resident_feed(p_resident uuid, p_offset integer, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not exists(select 1 from public.residents where id=p_resident and user_id=auth.uid()) then raise exception 'Own resident record required.' using errcode='42501'; end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid notification page.' using errcode='22023'; end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc,id desc) from (
 select id,resident_id,title,case when category='message' then coalesce((select private.boarding_message_sender_name(m.id) from public.boarding_messages m where event_key='message:'||m.id::text),'Admin')||' sent a boarding house message.' else message end as message,category,related_entity_id,coalesce(is_read,false) is_read,created_at from public.notifications
 where resident_id=p_resident and (category<>'message' or private.boarding_message_notification_visible(event_key,related_entity_id)) order by created_at desc,id desc limit p_limit offset p_offset)x),'[]'::jsonb),
 'unread_count',(select count(*) from public.notifications where resident_id=p_resident and not coalesce(is_read,false) and (category<>'message' or private.boarding_message_notification_visible(event_key,related_entity_id))),
 'total',(select count(*) from public.notifications where resident_id=p_resident and (category<>'message' or private.boarding_message_notification_visible(event_key,related_entity_id))));
end $function$
;
CREATE OR REPLACE FUNCTION private.brims_conversations()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.latest_at desc,x.id) from (
  select h.id,h.name,
   coalesce((select nullif(trim(concat_ws(' ',nullif(trim(r.first_name),''),nullif(trim(r.middle_name),''),nullif(trim(r.last_name),''),nullif(trim(r.suffix),''))),'')
     from public.residents r where r.id=h.owner_resident_id and r.user_id=h.owner_user_id),nullif(trim(h.owner_name),''),'Landlord/Landlady') as owner_name,
   h.owner_user_id,h.active,
   (select private.boarding_message_sender_name(m.id) from public.boarding_messages m where m.boarding_house_id=h.id order by m.created_at desc,m.id desc limit 1) as latest_sender_name,
   (select m.body from public.boarding_messages m where m.boarding_house_id=h.id order by m.created_at desc,m.id desc limit 1) as latest_body,
exists(select 1 from public.residents r where r.id=h.owner_resident_id and r.user_id=h.owner_user_id and r.boarding_status='landlord') and (select r.boarding_status from public.residents r where r.user_id=h.owner_user_id order by r.updated_at desc nulls last,r.id limit 1)='landlord' as can_send,coalesce((select max(m.created_at) from public.boarding_messages m where m.boarding_house_id=h.id),h.created_at) as latest_at,
   (select count(*) from public.boarding_messages m where m.boarding_house_id=h.id and m.sender_user_id<>auth.uid() and m.created_at>coalesce((select r.read_at from public.boarding_conversation_reads r where r.boarding_house_id=h.id and r.user_id=auth.uid()),'-infinity'::timestamptz)) as unread_count
  from public.boarding_houses h where private.boarding_chat_access(h.id)) x),'[]'::jsonb);
end $function$
;

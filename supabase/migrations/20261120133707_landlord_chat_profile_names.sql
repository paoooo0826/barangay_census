-- Resolve the assigned account's saved profile name. The existing access
-- predicate, unread-count rules, sending eligibility and function grants remain.
create or replace function private.brims_conversations() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.latest_at desc,x.id) from (
  select h.id,h.name,
   coalesce((select nullif(trim(concat_ws(' ',nullif(trim(r.first_name),''),nullif(trim(r.middle_name),''),nullif(trim(r.last_name),''),nullif(trim(r.suffix),''))),'')
     from public.residents r where r.id=h.owner_resident_id and r.user_id=h.owner_user_id),nullif(trim(h.owner_name),''),'Landlord/Landlady') as owner_name,
   h.owner_user_id,h.active,exists(select 1 from public.residents r where r.id=h.owner_resident_id and r.user_id=h.owner_user_id and r.boarding_status='landlord') and (select r.boarding_status from public.residents r where r.user_id=h.owner_user_id order by r.updated_at desc nulls last,r.id limit 1)='landlord' as can_send,coalesce((select max(m.created_at) from public.boarding_messages m where m.boarding_house_id=h.id),h.created_at) as latest_at,
   (select count(*) from public.boarding_messages m where m.boarding_house_id=h.id and m.sender_user_id<>auth.uid() and m.created_at>coalesce((select r.read_at from public.boarding_conversation_reads r where r.boarding_house_id=h.id and r.user_id=auth.uid()),'-infinity'::timestamptz)) as unread_count
  from public.boarding_houses h where private.boarding_chat_access(h.id)) x),'[]'::jsonb);
end $$;

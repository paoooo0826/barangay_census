-- Shared English/Tagalog word list: src/lib/profanity-terms.json.
create function private.contains_profanity(p_text text) returns boolean
language sql immutable set search_path='' as $moderation$
 with normalized as (select translate(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(pg_catalog.normalize(coalesce(p_text,''),'NFKD')),U&'[\0300-\036f]','','g'),'@(?=[a-z])','a','g'),'[$](?=[a-z])','s','g'),'!(?=[a-z])','i','g'),'01345789','oieastbg') value), candidates as (select regexp_replace(value,'[^a-z]+',' ','g') words,regexp_replace(regexp_replace(value,'[^a-z[:space:]]','','g'),'[[:space:]]+',' ','g') joined from normalized)
 select words ~ '(^|[^a-z])(f+u+c+k+|f+u+c+k+e+r+|f+u+c+k+e+r+s+|f+u+c+k+i+n+g+|f+u+c+k+e+d+|f+c+k+|f+c+k+i+n+g+|f+u+k+|m+o+t+h+e+r+f+u+c+k+e+r+|m+o+t+h+e+r+f+u+c+k+i+n+g+|s+h+i+t+|s+h+i+t+t+y+|b+u+l+l+s+h+i+t+|b+i+t+c+h+|b+i+t+c+h+e+s+|a+s+s+h+o+l+e+|a+s+s+h+o+l+e+s+|c+u+n+t+|d+i+c+k+h+e+a+d+|p+u+t+a+|p+o+t+a+|p+u+t+a+n+g+i+n+a+|p+u+t+a+n+g+i+n+a+n+g+|p+u+t+a+n+g+i+n+a+m+o+|p+t+a+n+g+i+n+a+|t+a+n+g+i+n+a+|t+a+n+g+i+n+a+n+g+|t+a+n+g+i+n+a+m+o+|g+a+g+o+|g+a+g+o+n+g+|g+a+g+a+|g+a+g+a+n+g+|b+o+b+o+|b+o+b+o+n+g+|t+a+n+g+a+|t+a+n+g+a+n+g+|u+l+o+l+|p+u+n+y+e+t+a+|t+a+r+a+n+t+a+d+o+|t+a+r+a+n+t+a+d+a+|k+u+p+a+l+|p+a+k+y+u+|p+a+k+y+o+u+|p+a+k+s+h+e+t+)($|[^a-z])' or joined ~ '(^|[^a-z])(f+u+c+k+|f+u+c+k+e+r+|f+u+c+k+e+r+s+|f+u+c+k+i+n+g+|f+u+c+k+e+d+|f+c+k+|f+c+k+i+n+g+|f+u+k+|m+o+t+h+e+r+f+u+c+k+e+r+|m+o+t+h+e+r+f+u+c+k+i+n+g+|s+h+i+t+|s+h+i+t+t+y+|b+u+l+l+s+h+i+t+|b+i+t+c+h+|b+i+t+c+h+e+s+|a+s+s+h+o+l+e+|a+s+s+h+o+l+e+s+|c+u+n+t+|d+i+c+k+h+e+a+d+|p+u+t+a+|p+o+t+a+|p+u+t+a+n+g+i+n+a+|p+u+t+a+n+g+i+n+a+n+g+|p+u+t+a+n+g+i+n+a+m+o+|p+t+a+n+g+i+n+a+|t+a+n+g+i+n+a+|t+a+n+g+i+n+a+n+g+|t+a+n+g+i+n+a+m+o+|g+a+g+o+|g+a+g+o+n+g+|g+a+g+a+|g+a+g+a+n+g+|b+o+b+o+|b+o+b+o+n+g+|t+a+n+g+a+|t+a+n+g+a+n+g+|u+l+o+l+|p+u+n+y+e+t+a+|t+a+r+a+n+t+a+d+o+|t+a+r+a+n+t+a+d+a+|k+u+p+a+l+|p+a+k+y+u+|p+a+k+y+o+u+|p+a+k+s+h+e+t+)($|[^a-z])' or words ~ '(^|[^a-z])(f+[[:space:]]+u+[[:space:]]+c+[[:space:]]+k+|f+[[:space:]]+u+[[:space:]]+c+[[:space:]]+k+[[:space:]]+e+[[:space:]]+r+|f+[[:space:]]+u+[[:space:]]+c+[[:space:]]+k+[[:space:]]+e+[[:space:]]+r+[[:space:]]+s+|f+[[:space:]]+u+[[:space:]]+c+[[:space:]]+k+[[:space:]]+i+[[:space:]]+n+[[:space:]]+g+|f+[[:space:]]+u+[[:space:]]+c+[[:space:]]+k+[[:space:]]+e+[[:space:]]+d+|f+[[:space:]]+c+[[:space:]]+k+|f+[[:space:]]+c+[[:space:]]+k+[[:space:]]+i+[[:space:]]+n+[[:space:]]+g+|f+[[:space:]]+u+[[:space:]]+k+|m+[[:space:]]+o+[[:space:]]+t+[[:space:]]+h+[[:space:]]+e+[[:space:]]+r+[[:space:]]+f+[[:space:]]+u+[[:space:]]+c+[[:space:]]+k+[[:space:]]+e+[[:space:]]+r+|m+[[:space:]]+o+[[:space:]]+t+[[:space:]]+h+[[:space:]]+e+[[:space:]]+r+[[:space:]]+f+[[:space:]]+u+[[:space:]]+c+[[:space:]]+k+[[:space:]]+i+[[:space:]]+n+[[:space:]]+g+|s+[[:space:]]+h+[[:space:]]+i+[[:space:]]+t+|s+[[:space:]]+h+[[:space:]]+i+[[:space:]]+t+[[:space:]]+t+[[:space:]]+y+|b+[[:space:]]+u+[[:space:]]+l+[[:space:]]+l+[[:space:]]+s+[[:space:]]+h+[[:space:]]+i+[[:space:]]+t+|b+[[:space:]]+i+[[:space:]]+t+[[:space:]]+c+[[:space:]]+h+|b+[[:space:]]+i+[[:space:]]+t+[[:space:]]+c+[[:space:]]+h+[[:space:]]+e+[[:space:]]+s+|a+[[:space:]]+s+[[:space:]]+s+[[:space:]]+h+[[:space:]]+o+[[:space:]]+l+[[:space:]]+e+|a+[[:space:]]+s+[[:space:]]+s+[[:space:]]+h+[[:space:]]+o+[[:space:]]+l+[[:space:]]+e+[[:space:]]+s+|c+[[:space:]]+u+[[:space:]]+n+[[:space:]]+t+|d+[[:space:]]+i+[[:space:]]+c+[[:space:]]+k+[[:space:]]+h+[[:space:]]+e+[[:space:]]+a+[[:space:]]+d+|p+[[:space:]]+u+[[:space:]]+t+[[:space:]]+a+|p+[[:space:]]+o+[[:space:]]+t+[[:space:]]+a+|p+[[:space:]]+u+[[:space:]]+t+[[:space:]]+a+[[:space:]]+n+[[:space:]]+g+[[:space:]]+i+[[:space:]]+n+[[:space:]]+a+|p+[[:space:]]+u+[[:space:]]+t+[[:space:]]+a+[[:space:]]+n+[[:space:]]+g+[[:space:]]+i+[[:space:]]+n+[[:space:]]+a+[[:space:]]+n+[[:space:]]+g+|p+[[:space:]]+u+[[:space:]]+t+[[:space:]]+a+[[:space:]]+n+[[:space:]]+g+[[:space:]]+i+[[:space:]]+n+[[:space:]]+a+[[:space:]]+m+[[:space:]]+o+|p+[[:space:]]+t+[[:space:]]+a+[[:space:]]+n+[[:space:]]+g+[[:space:]]+i+[[:space:]]+n+[[:space:]]+a+|t+[[:space:]]+a+[[:space:]]+n+[[:space:]]+g+[[:space:]]+i+[[:space:]]+n+[[:space:]]+a+|t+[[:space:]]+a+[[:space:]]+n+[[:space:]]+g+[[:space:]]+i+[[:space:]]+n+[[:space:]]+a+[[:space:]]+n+[[:space:]]+g+|t+[[:space:]]+a+[[:space:]]+n+[[:space:]]+g+[[:space:]]+i+[[:space:]]+n+[[:space:]]+a+[[:space:]]+m+[[:space:]]+o+|g+[[:space:]]+a+[[:space:]]+g+[[:space:]]+o+|g+[[:space:]]+a+[[:space:]]+g+[[:space:]]+o+[[:space:]]+n+[[:space:]]+g+|g+[[:space:]]+a+[[:space:]]+g+[[:space:]]+a+|g+[[:space:]]+a+[[:space:]]+g+[[:space:]]+a+[[:space:]]+n+[[:space:]]+g+|b+[[:space:]]+o+[[:space:]]+b+[[:space:]]+o+|b+[[:space:]]+o+[[:space:]]+b+[[:space:]]+o+[[:space:]]+n+[[:space:]]+g+|t+[[:space:]]+a+[[:space:]]+n+[[:space:]]+g+[[:space:]]+a+|t+[[:space:]]+a+[[:space:]]+n+[[:space:]]+g+[[:space:]]+a+[[:space:]]+n+[[:space:]]+g+|u+[[:space:]]+l+[[:space:]]+o+[[:space:]]+l+|p+[[:space:]]+u+[[:space:]]+n+[[:space:]]+y+[[:space:]]+e+[[:space:]]+t+[[:space:]]+a+|t+[[:space:]]+a+[[:space:]]+r+[[:space:]]+a+[[:space:]]+n+[[:space:]]+t+[[:space:]]+a+[[:space:]]+d+[[:space:]]+o+|t+[[:space:]]+a+[[:space:]]+r+[[:space:]]+a+[[:space:]]+n+[[:space:]]+t+[[:space:]]+a+[[:space:]]+d+[[:space:]]+a+|k+[[:space:]]+u+[[:space:]]+p+[[:space:]]+a+[[:space:]]+l+|p+[[:space:]]+a+[[:space:]]+k+[[:space:]]+y+[[:space:]]+u+|p+[[:space:]]+a+[[:space:]]+k+[[:space:]]+y+[[:space:]]+o+[[:space:]]+u+|p+[[:space:]]+a+[[:space:]]+k+[[:space:]]+s+[[:space:]]+h+[[:space:]]+e+[[:space:]]+t+)($|[^a-z])' or words ~ '(^|[[:space:]])(p+u+t+a+n+g+|t+a+n+g+)[[:space:]]+i+n+a+(n+g+|m+o+)?($|[[:space:]])' from candidates;
$moderation$;
revoke all on function private.contains_profanity(text) from public,anon,authenticated;

-- Authorize the conversation itself, independently of a client tab/role prop.
create function private.boarding_chat_access(p_house uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (public.is_active_admin() or exists(
  select 1 from public.boarding_houses h where h.id=p_house and h.owner_user_id=auth.uid()
   and census_private.owns_house(h.id)
   and (select r.boarding_status from public.residents r where r.user_id=auth.uid() order by r.updated_at desc nulls last,r.id limit 1)='landlord'));
$$;
revoke all on function private.boarding_chat_access(uuid) from public,anon;
grant execute on function private.boarding_chat_access(uuid) to authenticated;
alter policy boarding_message_read on public.boarding_messages using (private.boarding_chat_access(boarding_house_id));
alter policy boarding_message_receipt_read on public.boarding_conversation_reads using(user_id=(select auth.uid()) and private.boarding_chat_access(boarding_house_id));
create policy current_landlord_message_notifications on public.notifications as restrictive for select to authenticated
 using(category<>'message' or private.boarding_chat_access(related_entity_id));

create or replace function private.brims_resident_feed(p_resident uuid,p_offset integer,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.residents where id=p_resident and user_id=auth.uid()) then raise exception 'Own resident record required.' using errcode='42501'; end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid notification page.' using errcode='22023'; end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc,id desc) from (
 select id,resident_id,title,message,category,related_entity_id,coalesce(is_read,false) is_read,created_at from public.notifications
 where resident_id=p_resident and (category<>'message' or private.boarding_chat_access(related_entity_id)) order by created_at desc,id desc limit p_limit offset p_offset)x),'[]'::jsonb),
 'unread_count',(select count(*) from public.notifications where resident_id=p_resident and not coalesce(is_read,false) and (category<>'message' or private.boarding_chat_access(related_entity_id))),
 'total',(select count(*) from public.notifications where resident_id=p_resident and (category<>'message' or private.boarding_chat_access(related_entity_id))));
end $$;

alter table public.incident_reports
 add column landmark text not null default '' check(length(landmark)<=300),
 add column search_text text generated always as (coalesce(tracking_reference,'')||' '||coalesce(description,'')||' '||coalesce(location,'')||' '||coalesce(landmark,'')) stored,
 add column latitude numeric(9,6), add column longitude numeric(9,6),
 add column location_accuracy numeric check(location_accuracy between 0 and 100000),
 add column language_flagged boolean not null default false,
 add column last_follow_up_at timestamptz,
 add constraint incident_coordinates_valid check((latitude is null and longitude is null and location_accuracy is null) or (latitude between -90 and 90 and longitude between -180 and 180 and latitude is not null and longitude is not null));
alter table public.community_case_updates
 add column entry_type text not null default 'status_update' check(entry_type in ('status_update','resident_follow_up','admin_reply')),
 add column request_key uuid,
 add column language_flagged boolean not null default false;
create unique index case_follow_up_retry on public.community_case_updates(actor_user_id,request_key) where request_key is not null;

-- Block offensive messages/feedback; flag incident evidence without destroying it.
create function private.moderate_community_text() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='boarding_messages' then
  if private.contains_profanity(new.body) then raise exception 'Please revise the offensive English or Tagalog wording before sending. Your text has been kept so you can edit it.' using errcode='22023'; end if;
 elsif tg_table_name='resident_feedback' then
  if (tg_op='INSERT' or new.content is distinct from old.content) and private.contains_profanity(new.content) then raise exception 'Please revise the offensive English or Tagalog wording before sending. Your text has been kept so you can edit it.' using errcode='22023'; end if;
  if (tg_op='INSERT' or new.response is distinct from old.response) and private.contains_profanity(new.response) then raise exception 'Please revise the offensive English or Tagalog wording before sending. Your text has been kept so you can edit it.' using errcode='22023'; end if;
 elsif tg_table_name='incident_reports' then
  if tg_op='INSERT' or new.description is distinct from old.description then new.language_flagged:=private.contains_profanity(new.description); end if;
  if (tg_op='INSERT' or new.response is distinct from old.response) and private.contains_profanity(new.response) then raise exception 'Please revise the offensive English or Tagalog wording before sending. Your text has been kept so you can edit it.' using errcode='22023'; end if;
 elsif tg_table_name='appointments' then
  if ((tg_op='INSERT' or new.purpose is distinct from old.purpose) and private.contains_profanity(new.purpose)) or ((tg_op='INSERT' or new.cancellation_reason is distinct from old.cancellation_reason) and private.contains_profanity(new.cancellation_reason)) or ((tg_op='INSERT' or new.admin_notes is distinct from old.admin_notes) and private.contains_profanity(new.admin_notes)) then raise exception 'Please revise the offensive English or Tagalog wording before sending. Your text has been kept so you can edit it.' using errcode='22023'; end if;
 elsif tg_table_name='announcements' then
  if ((tg_op='INSERT' or new.title is distinct from old.title) and private.contains_profanity(new.title)) or ((tg_op='INSERT' or new.message is distinct from old.message) and private.contains_profanity(new.message)) then raise exception 'Please revise the offensive English or Tagalog wording before sending. Your text has been kept so you can edit it.' using errcode='22023'; end if;
 elsif tg_table_name='remarks' then
  if (tg_op='INSERT' or new.remark_text is distinct from old.remark_text) and private.contains_profanity(new.remark_text) then raise exception 'Please revise the offensive English or Tagalog wording before sending. Your text has been kept so you can edit it.' using errcode='22023'; end if;
 elsif tg_table_name='community_case_updates' then
  if new.entry_type='resident_follow_up' then new.language_flagged:=private.contains_profanity(new.message);
  elsif private.contains_profanity(new.message) then raise exception 'Please revise the offensive English or Tagalog wording before sending. Your text has been kept so you can edit it.' using errcode='22023'; end if;
 end if;
 return new;
end $$;
revoke all on function private.moderate_community_text() from public,anon,authenticated;
create trigger moderate_boarding_message before insert or update on public.boarding_messages for each row execute function private.moderate_community_text();
create trigger moderate_feedback before insert or update on public.resident_feedback for each row execute function private.moderate_community_text();
create trigger moderate_incident before insert or update on public.incident_reports for each row execute function private.moderate_community_text();
create trigger moderate_case_update before insert or update on public.community_case_updates for each row execute function private.moderate_community_text();

-- Append-only follow-ups preserve the original report and current status.
create function private.incident_follow_up(p_report uuid,p_message text,p_request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); original public.incident_reports; saved public.incident_reports; previous public.community_case_updates; clean text:=trim(coalesce(p_message,'')); is_admin boolean:=public.is_active_admin(); staff_reply boolean;
begin
 if actor is null then raise exception 'Authentication required.' using errcode='42501'; end if;
 if p_request_key is null or length(clean) not between 3 and 4000 then raise exception 'Write a follow-up with 3 to 4000 characters.' using errcode='22023'; end if;
 select * into original from public.incident_reports where id=p_report for update;
 if not found or (not is_admin and original.user_id<>actor) then raise exception 'This report is unavailable to your account.' using errcode='42501'; end if;
 staff_reply:=is_admin and original.user_id<>actor;
 select * into previous from public.community_case_updates where actor_user_id=actor and request_key=p_request_key;
 if found then
  if previous.incident_id is distinct from p_report or previous.message<>clean then raise exception 'Follow-up retry does not match the original message.' using errcode='22023'; end if;
  return to_jsonb(original);
 end if;
 insert into public.community_case_updates(incident_id,user_id,actor_user_id,status,message,entry_type,request_key)
 values(p_report,original.user_id,actor,original.status,clean,case when staff_reply then 'admin_reply' else 'resident_follow_up' end,p_request_key);
 update public.incident_reports set last_follow_up_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 where id=p_report returning * into saved;
 if staff_reply then
  perform private.brims_resident_event('incident_reply:'||p_request_key::text,original.resident_id,'incident',p_report,'Incident Follow-up Response','The barangay office replied to your incident report.');
 else
  perform private.brims_admin_event('incident_follow_up:'||p_request_key::text,'incident',p_report,'Incident Follow-up','A resident added a follow-up to an incident report.');
 end if;
 return to_jsonb(saved);
end $$;
create function public.add_incident_follow_up(p_incident_id uuid,p_message text,p_request_key uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.incident_follow_up(p_incident_id,p_message,p_request_key)$$;

-- Detailed location is optional, but a pin always requires both coordinates.
create function private.incident_with_location(p_category text,p_description text,p_location text,p_occurred_at timestamptz,p_image_paths text[],p_request_key uuid,p_landmark text,p_latitude numeric,p_longitude numeric,p_accuracy numeric) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; saved public.incident_reports; clean_landmark text:=trim(coalesce(p_landmark,'')); new_key boolean; clean_lat numeric:=round(p_latitude,6); clean_lon numeric:=round(p_longitude,6);
begin
 if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
 if length(clean_landmark)>300 or (p_latitude is null)<>(p_longitude is null) or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
 or (p_accuracy is not null and (p_latitude is null or p_accuracy not between 0 and 100000)) then raise exception 'Provide a valid location pin and landmark.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':incident:'||p_request_key::text,0));
 new_key:=not exists(select 1 from public.incident_reports where user_id=auth.uid() and request_key=p_request_key);
 result:=private.brims_submit_incident(p_category,p_description,p_location,p_occurred_at,p_image_paths,p_request_key);
 select * into saved from public.incident_reports where id=(result->>'id')::uuid for update;
 if not new_key and (saved.landmark<>clean_landmark or saved.latitude is distinct from clean_lat or saved.longitude is distinct from clean_lon or saved.location_accuracy is distinct from p_accuracy) then raise exception 'Incident retry does not match the original location.' using errcode='22023'; end if;
 if new_key then update public.incident_reports set landmark=clean_landmark,latitude=clean_lat,longitude=clean_lon,location_accuracy=p_accuracy where id=saved.id returning * into saved; end if;
 return to_jsonb(saved);
end $$;
create function public.submit_incident_with_location(p_category text,p_description text,p_location text,p_occurred_at timestamptz,p_image_paths text[],p_request_key uuid,p_landmark text default '',p_latitude numeric default null,p_longitude numeric default null,p_accuracy numeric default null) returns jsonb
language sql security invoker set search_path='' as $$select private.incident_with_location(p_category,p_description,p_location,p_occurred_at,p_image_paths,p_request_key,p_landmark,p_latitude,p_longitude,p_accuracy)$$;

-- One versioned admin feedback note per recorded census update.
create table public.resident_update_feedback (
 id uuid primary key default gen_random_uuid(), history_id uuid not null unique references public.audit_logs(id),
 resident_id uuid not null references public.residents(id), user_id uuid not null references auth.users(id),
 admin_user_id uuid not null references auth.users(id), message text not null check(length(trim(message)) between 3 and 3000),
 version integer not null default 1 check(version>0), request_key uuid not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(admin_user_id,request_key)
);
create index resident_update_feedback_resident on public.resident_update_feedback(resident_id);
create index resident_update_feedback_owner on public.resident_update_feedback(user_id,resident_id,updated_at desc);
alter table public.resident_update_feedback enable row level security;
create policy update_feedback_read on public.resident_update_feedback for select to authenticated using(user_id=(select auth.uid()) or (select public.is_active_admin()));
revoke all on public.resident_update_feedback from anon,authenticated;
grant select on public.resident_update_feedback to authenticated;
create function private.save_update_feedback(p_resident uuid,p_history uuid,p_message text,p_expected_version integer,p_request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); owner_id uuid; original public.resident_update_feedback; saved public.resident_update_feedback; clean text:=trim(coalesce(p_message,''));
begin
 if actor is null or not public.is_active_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
 if p_request_key is null or p_expected_version is null or p_expected_version<0 or length(clean) not between 3 and 3000 then raise exception 'Write feedback with 3 to 3000 characters.' using errcode='22023'; end if;
 if private.contains_profanity(clean) then raise exception 'Please revise the offensive English or Tagalog wording before sending. Your text has been kept so you can edit it.' using errcode='22023'; end if;
 select user_id into owner_id from public.residents where id=p_resident;
 if owner_id is null or not exists(select 1 from public.audit_logs where id=p_history and entity_type='resident' and entity_id=p_resident and action in ('census_submitted','census_updated','census_details_updated')) then raise exception 'This census update is unavailable.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('update-feedback:'||p_history::text,0));
 select * into original from public.resident_update_feedback where history_id=p_history for update;
 if found then
  if original.request_key=p_request_key and original.admin_user_id=actor and original.message=clean then return to_jsonb(original); end if;
  if original.version<>p_expected_version then raise exception 'Feedback changed. Reload the history before saving again.' using errcode='40001'; end if;
  update public.resident_update_feedback set message=clean,admin_user_id=actor,request_key=p_request_key,version=version+1,updated_at=clock_timestamp() where id=original.id returning * into saved;
 else
  if p_expected_version<>0 then raise exception 'Feedback changed. Reload the history before saving again.' using errcode='40001'; end if;
  insert into public.resident_update_feedback(history_id,resident_id,user_id,admin_user_id,message,request_key) values(p_history,p_resident,owner_id,actor,clean,p_request_key) returning * into saved;
 end if;
 perform private.brims_resident_event('update_feedback:'||saved.id::text||':'||saved.version::text,p_resident,'census',p_resident,'Feedback on Your Census Update','The barangay office added feedback to a saved census update. Open Record History to read it.');
 insert into public.audit_logs(user_id,action,entity_type,entity_id,details) values(actor,'census_update_feedback','resident',p_resident,jsonb_build_object('history_id',p_history,'feedback_id',saved.id,'message',clean,'version',saved.version));
 return to_jsonb(saved);
end $$;
create function public.save_resident_update_feedback(p_resident_id uuid,p_history_id uuid,p_message text,p_expected_version integer,p_request_key uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.save_update_feedback(p_resident_id,p_history_id,p_message,p_expected_version,p_request_key)$$;

-- Residents receive only their own history and generic staff attribution.
create function private.own_record_history(p_resident uuid,p_offset integer,p_limit integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.residents where id=p_resident and user_id=auth.uid()) then raise exception 'Own resident record required.' using errcode='42501'; end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 20 then raise exception 'Invalid history page.' using errcode='22023'; end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc,id) from (
  select l.id,l.action,(l.details-'actor_name'-'ip_address'-'changes')||case when l.details?'changes' then jsonb_build_object('changes',(l.details->'changes')-'philsys_number'-'vocational_course') else '{}'::jsonb end as details,l.created_at,
  case when l.user_id=auth.uid() then 'You' when l.user_id is null then 'System' else 'Barangay Administrator' end actor_name
  from public.audit_logs l where l.entity_type='resident' and l.entity_id=p_resident and l.action in ('census_submitted','census_updated','census_details_updated','approve','reject','return','census_update_feedback') order by l.created_at desc,l.id limit p_limit offset p_offset)x),'[]'::jsonb),
  'total',(select count(*) from public.audit_logs where entity_type='resident' and entity_id=p_resident and action in ('census_submitted','census_updated','census_details_updated','approve','reject','return','census_update_feedback')));
end $$;
create function public.resident_record_history(p_resident_id uuid,p_offset integer default 0,p_limit integer default 8) returns jsonb
language sql security invoker set search_path='' as $$select private.own_record_history(p_resident_id,p_offset,p_limit)$$;

revoke all on function private.incident_follow_up(uuid,text,uuid),private.incident_with_location(text,text,text,timestamptz,text[],uuid,text,numeric,numeric,numeric),private.save_update_feedback(uuid,uuid,text,integer,uuid),private.own_record_history(uuid,integer,integer),public.add_incident_follow_up(uuid,text,uuid),public.submit_incident_with_location(text,text,text,timestamptz,text[],uuid,text,numeric,numeric,numeric),public.save_resident_update_feedback(uuid,uuid,text,integer,uuid),public.resident_record_history(uuid,integer,integer) from public,anon;
grant execute on function private.incident_follow_up(uuid,text,uuid),private.incident_with_location(text,text,text,timestamptz,text[],uuid,text,numeric,numeric,numeric),private.save_update_feedback(uuid,uuid,text,integer,uuid),private.own_record_history(uuid,integer,integer),public.add_incident_follow_up(uuid,text,uuid),public.submit_incident_with_location(text,text,text,timestamptz,text[],uuid,text,numeric,numeric,numeric),public.save_resident_update_feedback(uuid,uuid,text,integer,uuid),public.resident_record_history(uuid,integer,integer) to authenticated;


create or replace function private.brims_send_message(p_house uuid,p_body text,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved public.boarding_messages; house public.boarding_houses;
begin
 if not private.boarding_chat_access(p_house) then raise exception 'This conversation is unavailable to your account.' using errcode='42501'; end if;
 if p_request_key is null or length(trim(coalesce(p_body,''))) not between 1 and 4000 then raise exception 'Write a message with 1 to 4000 characters.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':message:'||p_request_key::text,0));
 select * into saved from public.boarding_messages where sender_user_id=actor and request_key=p_request_key;
 if found then if saved.boarding_house_id<>p_house or saved.body<>trim(p_body) then raise exception 'Message retry does not match the original.' using errcode='22023'; end if; return to_jsonb(saved); end if;
 select * into house from public.boarding_houses where id=p_house;
 if not exists(select 1 from public.residents r where r.id=house.owner_resident_id and r.user_id=house.owner_user_id and r.boarding_status='landlord') or (select r.boarding_status from public.residents r where r.user_id=house.owner_user_id order by r.updated_at desc nulls last,r.id limit 1) is distinct from 'landlord' then raise exception 'The assigned owner no longer has landlord access. This conversation is read-only for administrators.' using errcode='42501'; end if;
 insert into public.boarding_messages(boarding_house_id,sender_user_id,sender_role,body,request_key)
 values(p_house,actor,case when public.is_active_admin() then 'admin' else 'landlord' end,trim(p_body),p_request_key) returning * into saved;
 if saved.sender_role='landlord' then perform private.brims_admin_event('message:'||saved.id::text,'landlord_message',p_house,'New Landlord Message','A landlord/landlady sent a message about an assigned boarding house.');
 else perform private.brims_resident_event('message:'||saved.id::text,house.owner_resident_id,'message',p_house,'New Barangay Message','The barangay office sent a message about your assigned boarding house.'); end if;
 return to_jsonb(saved);
end $$;

create or replace function private.brims_conversations() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.latest_at desc,x.id) from (
  select h.id,h.name,h.owner_name,h.active,exists(select 1 from public.residents r where r.id=h.owner_resident_id and r.user_id=h.owner_user_id and r.boarding_status='landlord') and (select r.boarding_status from public.residents r where r.user_id=h.owner_user_id order by r.updated_at desc nulls last,r.id limit 1)='landlord' as can_send,coalesce((select max(m.created_at) from public.boarding_messages m where m.boarding_house_id=h.id),h.created_at) as latest_at,
   (select count(*) from public.boarding_messages m where m.boarding_house_id=h.id and m.sender_user_id<>auth.uid() and m.created_at>coalesce((select r.read_at from public.boarding_conversation_reads r where r.boarding_house_id=h.id and r.user_id=auth.uid()),'-infinity'::timestamptz)) as unread_count
  from public.boarding_houses h where private.boarding_chat_access(h.id)) x),'[]'::jsonb);
end $$;

create or replace function private.brims_mark_conversation(p_house uuid,p_through timestamptz) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.boarding_chat_access(p_house) then raise exception 'This conversation is unavailable to your account.' using errcode='42501'; end if;
 if p_through is null or p_through>clock_timestamp() then raise exception 'Invalid message read boundary.' using errcode='22023'; end if;
 insert into public.boarding_conversation_reads(boarding_house_id,user_id,read_at) values(p_house,auth.uid(),p_through) on conflict(boarding_house_id,user_id) do update set read_at=greatest(boarding_conversation_reads.read_at,excluded.read_at);
end $$;

create or replace function private.brims_review_case(p_kind text,p_id uuid,p_expected_updated_at timestamptz,p_status text,p_response text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare original jsonb; saved jsonb; clean_response text:=trim(coalesce(p_response,'')); actor uuid:=auth.uid(); resident uuid; owner_id uuid; next_version integer;
begin
 if actor is null or not public.is_active_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
 if p_kind='feedback' then
  select to_jsonb(f) into original from public.resident_feedback f where id=p_id for update;
  if p_status is null or p_status not in ('new','reviewed','resolved') then raise exception 'Invalid feedback status.' using errcode='22023'; end if;
 elsif p_kind='incident' then
  select to_jsonb(i) into original from public.incident_reports i where id=p_id for update;
  if p_status is null or p_status not in ('submitted','under_review','in_progress','resolved','rejected') then raise exception 'Invalid report status.' using errcode='22023'; end if;
  if p_status='rejected' and length(clean_response)<3 then raise exception 'A rejection reason is required.' using errcode='22023'; end if;
 else raise exception 'Invalid case type.' using errcode='22023'; end if;
 if original is null then raise exception 'The item is unavailable.' using errcode='P0002'; end if;
 if p_kind='incident' and (p_status<>original->>'status' or clean_response<>original->>'response') and length(clean_response)<3 then raise exception 'Add a short progress update or action taken for the resident.' using errcode='22023'; end if;
 if length(clean_response)>4000 then raise exception 'Use at most 4000 characters for the resident response.' using errcode='22023'; end if;
 -- An identical retry is safe even if the caller still holds the prior version.
 if original->>'status'=p_status and original->>'response'=clean_response then return original; end if;
 if p_expected_updated_at is null or (original->>'updated_at')::timestamptz<>p_expected_updated_at then raise exception 'This item changed. Reload it before saving.' using errcode='40001'; end if;
 if p_kind='incident' and original->>'status' in ('resolved','rejected') and p_status not in ('under_review',original->>'status') then raise exception 'Reopen a closed report as Under Review before progressing it.' using errcode='22023'; end if;
 resident:=(original->>'resident_id')::uuid; owner_id:=(original->>'user_id')::uuid; next_version:=(original->>'version')::integer+1;
 if p_kind='feedback' then
  update public.resident_feedback f set status=p_status,response=clean_response,version=next_version,updated_at=clock_timestamp() where id=p_id returning to_jsonb(f) into saved;
 else
  update public.incident_reports i set status=p_status,response=clean_response,version=next_version,updated_at=clock_timestamp() where id=p_id returning to_jsonb(i) into saved;
 end if;
 insert into public.community_case_updates(feedback_id,incident_id,user_id,actor_user_id,status,message)
 values(case when p_kind='feedback' then p_id end,case when p_kind='incident' then p_id end,owner_id,actor,p_status,clean_response);
 perform private.brims_resident_event(p_kind||':'||p_id::text||':'||next_version::text,resident,p_kind,p_id,
  case when p_kind='feedback' then 'Feedback Updated' else 'Incident Report Updated' end,
  'Status: '||initcap(replace(p_status,'_',' '))||case when clean_response<>'' then '. '||clean_response else '.' end);
 insert into public.audit_logs(user_id,action,entity_type,entity_id,details) values(actor,p_kind||'_reviewed',p_kind,p_id,jsonb_build_object('previous_status',original->>'status','status',p_status,'response',clean_response));
 return saved;
end $$;

create trigger moderate_appointment_text before insert or update on public.appointments for each row execute function private.moderate_community_text();
create trigger moderate_announcement_text before insert or update on public.announcements for each row execute function private.moderate_community_text();
create trigger moderate_review_remark before insert or update on public.remarks for each row execute function private.moderate_community_text();

notify pgrst, 'reload schema';

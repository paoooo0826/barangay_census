begin;
create or replace function private.save_census_and_clear_draft(p_resident jsonb,p_categories jsonb,p_government_id jsonb,p_face_verification jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb; target_id uuid; before_categories jsonb; after_categories jsonb; changes jsonb:='{}'; before_id public.government_ids; after_id public.government_ids; before_face text; after_face text;
begin
  if actor is null then raise exception 'Sign in before submitting your census.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  select id into target_id from public.residents where user_id=actor for update;
  if p_resident->>'census_mode'='create' and target_id is not null then
    raise exception 'Your census was already submitted in another window. Reload your dashboard.' using errcode='40001';
  end if;
  if p_resident->>'census_mode'='update' and target_id is null then
    raise exception 'Your census record is unavailable. Reload before submitting.' using errcode='40001';
  end if;
  if target_id is not null and p_resident ? 'expected_updated_at' and
    (nullif(p_resident->>'expected_updated_at','')::timestamptz is distinct from (select updated_at from public.residents where id=target_id)) then
    raise exception 'Your census record changed in another session. Your draft is preserved. Reload the record before submitting.' using errcode='40001';
  end if;
  if target_id is not null then
    select coalesce(jsonb_agg(c.name order by c.id),'[]') into before_categories from public.resident_categories rc join public.categories c on c.id=rc.category_id where rc.resident_id=target_id;
    select * into before_id from public.government_ids where resident_id=target_id;
    select captured_face_url into before_face from public.face_verifications where resident_id=target_id;
  end if;
  result:=private.save_resident_census(p_resident,p_categories,p_government_id,p_face_verification);
  if target_id is not null then
    select coalesce(jsonb_agg(c.name order by c.id),'[]') into after_categories from public.resident_categories rc join public.categories c on c.id=rc.category_id where rc.resident_id=target_id;
    select * into after_id from public.government_ids where resident_id=target_id;
    select captured_face_url into after_face from public.face_verifications where resident_id=target_id;
    if before_categories is distinct from after_categories then changes:=changes||jsonb_build_object('categories',jsonb_build_object('before',before_categories,'after',after_categories)); end if;
    if before_id.front_image_url is distinct from after_id.front_image_url or before_id.back_image_url is distinct from after_id.back_image_url or before_id.id_type is distinct from after_id.id_type then
      changes:=changes||jsonb_build_object('id_document',jsonb_build_object('before',coalesce(before_id.id_type,'Not provided'),'after',coalesce(after_id.id_type,'Updated images'))); end if;
    if before_face is distinct from after_face then changes:=changes||jsonb_build_object('live_photo',jsonb_build_object('before',case when before_face is null then 'Not provided' else 'Previous image' end,'after','Updated image')); end if;
    if changes<>'{}' then insert into public.audit_logs(user_id,action,entity_type,entity_id,details) values(actor,'census_details_updated','resident',target_id,jsonb_build_object('changes',changes)); end if;
  end if;
  delete from public.census_drafts where user_id=actor;
  return result;
end $$;
notify pgrst,'reload schema';
commit;

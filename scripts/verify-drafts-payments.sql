-- Run as the SQL Editor/database maintenance role. All fixtures and edits roll back.
begin;
create temp table feature_test_context as
select r.id as resident_id,r.user_id as owner_id,r.updated_at as original_version,
 (select user_id from public.admin_profiles where coalesce(is_active,true) limit 1) as admin_id,
 (select u.id from auth.users u where u.id<>r.user_id and not exists(select 1 from public.admin_profiles p where p.user_id=u.id and coalesce(p.is_active,true)) limit 1) as other_id,
 gen_random_uuid() as request_key, null::uuid as appointment_id,null::uuid as payment_id
from public.residents r where r.status='verified' and not public.is_active_admin() and
not exists(select 1 from public.admin_profiles p where p.user_id=r.user_id and coalesce(p.is_active,true)) limit 1;
-- The maintenance role normally has no authenticated JWT; use an explicit owner fixture.
do $$begin if (select count(*) from feature_test_context)<>1 then raise exception 'No verified non-admin resident available for rollback tests'; end if; end$$;
grant all on feature_test_context to authenticated;
set local role authenticated;
do $$
declare c record; draft jsonb; result jsonb; fee numeric; day date:=(now() at time zone 'Asia/Manila')::date+1; categories jsonb; payload jsonb;
begin
 select * into c from feature_test_context;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.owner_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',c.owner_id::text,true);
 -- Existing resident cannot save a new-registration draft.
 begin perform public.save_census_draft('create','{"first_name":"Draft"}',0,null); raise exception 'create draft accepted for existing resident'; exception when serialization_failure then null; end;
 draft:=public.save_census_draft('update','{"first_name":"Draft","email_address":"forged@test.invalid","philsys_number":"forged","file":"blob:fake","categories":[1]}',0,c.original_version);
 if draft->'payload' ?| array['email_address','philsys_number','file'] then raise exception 'protected values leaked into draft'; end if;
 if (draft->>'revision')::int<>1 then raise exception 'first draft revision incorrect'; end if;
 draft:=public.save_census_draft('update','{"first_name":"Updated draft"}',1,c.original_version);
 if (draft->>'revision')::int<>2 then raise exception 'draft revision did not increment'; end if;
 begin perform public.save_census_draft('update','{}',1,c.original_version); raise exception 'stale draft overwrote newer draft'; exception when serialization_failure then null; end;
 begin perform public.delete_census_draft('update',1); raise exception 'stale draft deletion accepted'; exception when serialization_failure then null; end;
 begin insert into public.census_drafts values(c.owner_id,'create','{}',1,null,now()); raise exception 'direct draft write accepted'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.other_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',c.other_id::text,true);
 if exists(select 1 from public.census_drafts where user_id=c.owner_id) then raise exception 'another resident can read draft'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.admin_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',c.admin_id::text,true);
 if exists(select 1 from public.census_drafts where user_id=c.owner_id) then raise exception 'admin can read private resident draft'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.owner_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',c.owner_id::text,true);
 -- An ordinary profile save clears drafts in the same transaction and logs actual field changes.
 select to_jsonb(r)||jsonb_build_object('religion',coalesce(r.religion,'')||' (rollback test)') into payload from public.residents r where id=c.resident_id;
 select coalesce(jsonb_agg(jsonb_build_object('category_id',category_id,'indigenous_group',indigenous_group,'other_description',other_description)),'[]') into categories from public.resident_categories where resident_id=c.resident_id;
 payload:=payload||jsonb_build_object('census_mode','update','expected_updated_at',c.original_version);
 result:=public.save_resident_census(payload,categories,null,null);
 begin perform public.save_resident_census(payload,categories,null,null); raise exception 'old form overwrote updated census'; exception when serialization_failure then null; end;
 if result->>'id'<>c.resident_id::text or exists(select 1 from public.census_drafts where user_id=c.owner_id) then raise exception 'submission did not clear own draft atomically'; end if;
 begin perform public.save_census_draft('update','{}',0,c.original_version); raise exception 'draft accepted for old record version'; exception when serialization_failure then null; end;
 if exists(select 1 from public.admin_resident_history where resident_id=c.resident_id) then raise exception 'resident can read admin audit history'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.admin_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',c.admin_id::text,true);
 if not exists(select 1 from public.admin_resident_history where resident_id=c.resident_id and action='census_updated' and details->'changes' ? 'religion') then raise exception 'field change absent from admin history'; end if;
end$$;
reset role;
rollback;
select 'Draft CAS/ownership, atomic cleanup and census audit history passed. All edits rolled back. Current receipt workflow checks are in scripts/verify-brims.sql.' as result;

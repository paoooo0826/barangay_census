begin;
-- All synthetic accounts, notices, announcements and acceptances roll back.
create temporary table terms_test_accounts(label text primary key,uid uuid,rid uuid);
insert into terms_test_accounts select label,gen_random_uuid(),gen_random_uuid()
from unnest(array['new','existing','admin','other']) label;
grant select on terms_test_accounts to authenticated,anon;
insert into auth.users(id,email) select uid,uid::text||'@test.invalid' from terms_test_accounts;
insert into public.residents(id,user_id,tracking_number,first_name,last_name,birth_date,birth_place,sex,civil_status,residential_address,tenurial_status,status)
select rid,uid,'TERMS-'||rid,'Terms','Test '||label,'1991-01-01','Baguio','Male','Single','Test Address','House Owner','verified'
from terms_test_accounts where label in ('existing','other');
insert into public.admin_profiles(user_id,full_name,is_active)
select uid,'Terms test administrator',true from terms_test_accounts where label='admin';
create temporary table terms_test_document as select id from public.terms_documents where is_active;
grant select on terms_test_document to authenticated,anon;
insert into public.terms_documents(version,title,content,is_active)
values ('synthetic-unpublished-test','Synthetic unpublished notice','Test-only fixture; never published.',false);

do $$ begin
 if (select count(*) from terms_test_document)<>1 then raise exception 'FAIL: no unique approved document'; end if;
 if not exists(select 1 from public.terms_documents where is_active and content=$notice$New Lucban values your privacy. Your personal information and identification documents will be kept confidential and used only for authorized barangay services, resident verification, and census purposes. Only authorized personnel may access your records. Your information will be protected and handled in accordance with the Data Privacy Act of 2012 (RA 10173).

Please read and understand this notice before proceeding.$notice$) then raise exception 'FAIL: approved notice differs from supplied content'; end if;
 if has_table_privilege('anon','public.account_terms_acceptances','SELECT')
 or has_table_privilege('authenticated','public.account_terms_acceptances','UPDATE')
 or has_column_privilege('authenticated','public.account_terms_acceptances','accepted_at','INSERT')
 or has_table_privilege('authenticated','public.terms_documents','UPDATE')
 then raise exception 'FAIL: terms permissions allow forgery or disclosure'; end if;
 if exists(select 1 from pg_proc where oid in ('public.get_account_terms()'::regprocedure,'public.accept_account_terms(uuid,boolean)'::regprocedure) and prosecdef)
 then raise exception 'FAIL: terms APIs must respect RLS'; end if;
end $$;

select set_config('request.jwt.claim.sub',(select uid::text from terms_test_accounts where label='new'),true);
set local role authenticated;
do $$ declare d uuid; first_receipt jsonb; repeated jsonb; begin
 select id into d from terms_test_document;
 if public.get_account_terms()->'acceptance'<>'null'::jsonb then raise exception 'FAIL: new user was automatically accepted'; end if;
 begin perform public.accept_account_terms(d,false); raise exception 'FAIL: unchecked agreement accepted'; exception when sqlstate '22023' then null; end;
 begin perform public.accept_account_terms(d,null); raise exception 'FAIL: missing agreement accepted'; exception when sqlstate '22023' then null; end;
 begin perform public.accept_account_terms(gen_random_uuid(),true); raise exception 'FAIL: wrong document accepted'; exception when sqlstate '22023' then null; end;
 if exists(select 1 from public.terms_documents where version='synthetic-unpublished-test') then raise exception 'FAIL: unpublished terms exposed'; end if;
 first_receipt:=public.accept_account_terms(d,true);
 if (first_receipt->>'user_id')::uuid<>auth.uid() or (first_receipt->>'terms_document_id')::uuid<>d
 or abs(extract(epoch from ((first_receipt->>'accepted_at')::timestamptz-statement_timestamp())))>2
 then raise exception 'FAIL: acceptance account, document or server timestamp incorrect'; end if;
 repeated:=public.accept_account_terms(d,true);
 if first_receipt<>repeated or (select count(*) from public.account_terms_acceptances)<>1 then raise exception 'FAIL: duplicate acceptance altered first receipt'; end if;
 if public.get_account_terms()->'acceptance'<>first_receipt then raise exception 'FAIL: later device lookup did not find saved acceptance'; end if;
 begin insert into public.account_terms_acceptances(user_id,terms_document_id) select uid,d from terms_test_accounts where label='other'; raise exception 'FAIL: another account accepted'; exception when insufficient_privilege then null; end;
 begin update public.account_terms_acceptances set accepted_at='2000-01-01'; raise exception 'FAIL: timestamp modified'; exception when insufficient_privilege then null; end;
 begin delete from public.account_terms_acceptances; raise exception 'FAIL: client erased acceptance'; exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claim.sub',(select uid::text from terms_test_accounts where label='existing'),true);
set local role authenticated;
do $$ declare d uuid; begin
 select id into d from terms_test_document;
 if public.get_account_terms()->'acceptance'<>'null'::jsonb or (select count(*) from public.account_terms_acceptances)<>0 then raise exception 'FAIL: existing account sees another account receipt'; end if;
 begin insert into public.account_terms_acceptances(user_id,terms_document_id,accepted_at) values(auth.uid(),d,'2000-01-01'); raise exception 'FAIL: forged acceptance date'; exception when insufficient_privilege then null; end;
 perform public.accept_account_terms(d,true);
 if (select count(*) from public.account_terms_acceptances)<>1 then raise exception 'FAIL: existing acceptance not stored'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub',(select uid::text from terms_test_accounts where label='admin'),true);
set local role authenticated;
do $$ declare d uuid; begin
 select id into d from terms_test_document;
 if (select count(*) from public.account_terms_acceptances)<>0 then raise exception 'FAIL: administrator reads resident acceptance'; end if;
 perform public.accept_account_terms(d,true);
 if public.get_account_terms()->'acceptance'->>'user_id'<>auth.uid()::text then raise exception 'FAIL: admin acceptance not linked to its account'; end if;
end $$;
reset role;

-- Original and banner objects retain the exact announcement audience scope.
create temporary table terms_test_images(kind text primary key,banner text,original text);
insert into terms_test_images select kind,'terms-test/'||gen_random_uuid()||'-banner.jpg','terms-test/'||gen_random_uuid()||'-original.jpg'
from unnest(array['visible','hidden','archived','expired','wrong_audience']) kind;
grant select on terms_test_images to authenticated,anon;
insert into public.announcements(title,message,priority,audience,is_published,published_at,expires_at,archived,image_path,image_original_path)
select 'Terms media regression '||kind,'Synthetic test announcement.','info',case when kind='wrong_audience' then 'pending_review' else 'all' end,
kind<>'hidden',now()-interval '1 day',case when kind='expired' then now()-interval '1 hour' else null end,kind='archived',banner,original
from terms_test_images;
select set_config('request.jwt.claim.sub',(select uid::text from terms_test_accounts where label='existing'),true);
set local role authenticated;
do $$ declare r record; begin
 for r in select * from terms_test_images loop
  if public.can_view_announcement_image(r.banner) is distinct from (r.kind='visible')
   or public.can_view_announcement_image(r.original) is distinct from (r.kind='visible')
  then raise exception 'FAIL: banner/original audience scope for %',r.kind; end if;
 end loop;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select uid::text from terms_test_accounts where label='admin'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from terms_test_images where not public.can_view_announcement_image(original)) then raise exception 'FAIL: admin original access'; end if;
 if (select count(*) from public.admin_announcement_list where title like 'Terms media regression %' and image_original_path is not null)<>5 then raise exception 'FAIL: admin view omitted originals'; end if;
end $$;
reset role;

update public.terms_documents set is_active=false where is_active;
select set_config('request.jwt.claim.sub',(select uid::text from terms_test_accounts where label='other'),true);
set local role authenticated;
do $$ declare d uuid; begin
 select id into d from terms_test_document;
 if public.get_account_terms()->'document'<>'null'::jsonb then raise exception 'FAIL: missing content not flagged'; end if;
 begin perform public.accept_account_terms(d,true); raise exception 'FAIL: unavailable document accepted'; exception when sqlstate '22023' then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 begin perform public.get_account_terms(); raise exception 'FAIL: anonymous terms API'; exception when insufficient_privilege then null; end;
 begin perform public.accept_account_terms(gen_random_uuid(),true); raise exception 'FAIL: anonymous acceptance API'; exception when insufficient_privilege then null; end;
 begin
  if public.can_view_announcement_image((select original from terms_test_images where kind='visible')) then raise exception 'FAIL: anonymous original image access'; end if;
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: persistent account consent, explicit agreement, immutable server dates, RLS, missing content and original-image scope' as result;
rollback;

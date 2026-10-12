-- Preserve whole announcement pictures alongside their cropped card banners.
alter table public.announcements add column image_original_path text;
create or replace view public.admin_announcement_list with (security_invoker = true) as
select id,title,message,priority,audience,is_published,published_at,expires_at,
 created_by,created_at,updated_at,image_path,archived,archived_at,archived_by,
 coalesce(archived_at,updated_at) as archive_sort,
 case priority when 'info' then 'Information' when 'important' then 'Important' else 'Urgent' end as priority_label,
 case audience when 'all' then 'All residents' when 'pending_review' then 'Pending review residents'
 when 'verified' then 'Verified residents' when 'returned' then 'Residents with returned records'
 else 'Residents with rejected records' end as audience_label,
 image_original_path
from public.announcements;

-- Keep the same audience, publication, expiration, and administrator scope.
create or replace function public.can_view_announcement_image(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
 select (select auth.uid()) is not null and (
  public.is_active_admin() or exists (
   select 1 from public.announcements a
   join public.residents r on r.user_id = (select auth.uid())
   where (a.image_path = object_name or a.image_original_path = object_name)
    and a.is_published = true and a.archived = false and a.published_at <= now()
    and (a.expires_at is null or a.expires_at > now())
    and (a.audience = 'all' or a.audience = r.status)
  )
 );
$$;

create table public.terms_documents (
 id uuid primary key default gen_random_uuid(),
 version text not null unique check (length(btrim(version)) between 1 and 80),
 title text not null check (length(btrim(title)) between 1 and 200),
 content text not null check (length(btrim(content)) between 1 and 100000),
 is_active boolean not null default false,
 published_at timestamptz,
 created_at timestamptz not null default statement_timestamp(),
 constraint active_terms_are_published check (not is_active or published_at is not null)
);
create unique index terms_documents_one_active on public.terms_documents (is_active) where is_active;
alter table public.terms_documents enable row level security;
revoke all on public.terms_documents from anon, authenticated;
grant select on public.terms_documents to authenticated;
create policy "Signed-in accounts read published terms" on public.terms_documents
 for select to authenticated using (published_at is not null and published_at <= now());

create table public.account_terms_acceptances (
 user_id uuid primary key references auth.users(id) on delete cascade,
 terms_document_id uuid not null references public.terms_documents(id),
 accepted_at timestamptz not null default statement_timestamp()
);
create index account_terms_document_idx on public.account_terms_acceptances(terms_document_id);
alter table public.account_terms_acceptances enable row level security;
revoke all on public.account_terms_acceptances from anon, authenticated;
grant select on public.account_terms_acceptances to authenticated;
-- Clients cannot supply a timestamp, update an acceptance, or accept for others.
grant insert(user_id,terms_document_id) on public.account_terms_acceptances to authenticated;
create policy "Accounts read only their own terms acceptance" on public.account_terms_acceptances
 for select to authenticated using ((select auth.uid()) = user_id);
create policy "Accounts accept currently approved terms for themselves" on public.account_terms_acceptances
 for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (
   select 1 from public.terms_documents d where d.id = terms_document_id
    and d.is_active and d.published_at is not null and d.published_at <= now()
  )
 );

create function public.get_account_terms()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to read Terms and Conditions.' using errcode = '28000'; end if;
 return jsonb_build_object(
  'document',(select jsonb_build_object('id',d.id,'version',d.version,'title',d.title,'content',d.content)
   from public.terms_documents d where d.is_active and d.published_at is not null and d.published_at <= now()),
  'acceptance',(select to_jsonb(a) from public.account_terms_acceptances a where a.user_id = auth.uid())
 );
end;
$$;
create function public.accept_account_terms(p_document_id uuid,p_agreed boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare receipt public.account_terms_acceptances; approved public.terms_documents;
begin
 if auth.uid() is null then raise exception 'Sign in before accepting Terms and Conditions.' using errcode = '28000'; end if;
 if p_agreed is distinct from true then raise exception 'Explicit agreement is required.' using errcode = '22023'; end if;
 select * into receipt from public.account_terms_acceptances where user_id = auth.uid();
 if found then return to_jsonb(receipt); end if;
 select * into approved from public.terms_documents
  where id = p_document_id and is_active and published_at is not null and published_at <= now();
 if not found then raise exception 'Approved terms content is missing or has changed. Reload and read the current notice.' using errcode = '22023'; end if;
 insert into public.account_terms_acceptances(user_id,terms_document_id)
  values (auth.uid(),approved.id) on conflict (user_id) do nothing;
 select * into receipt from public.account_terms_acceptances where user_id = auth.uid();
 return to_jsonb(receipt);
end;
$$;
revoke all on function public.get_account_terms(),public.accept_account_terms(uuid,boolean) from public,anon;
grant execute on function public.get_account_terms(),public.accept_account_terms(uuid,boolean) to authenticated;

-- Notice supplied and approved by the project owner on 2026-10-12. Stored verbatim.
insert into public.terms_documents(version,title,content,is_active,published_at)
values ('2026-10-12','Terms and Conditions',$notice$New Lucban values your privacy. Your personal information and identification documents will be kept confidential and used only for authorized barangay services, resident verification, and census purposes. Only authorized personnel may access your records. Your information will be protected and handled in accordance with the Data Privacy Act of 2012 (RA 10173).

Please read and understand this notice before proceeding.$notice$,true,statement_timestamp());

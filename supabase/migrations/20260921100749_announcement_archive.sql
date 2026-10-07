alter table public.announcements
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.admin_profiles(id) on delete set null;

create index if not exists announcements_archived_created_idx
  on public.announcements (archived, created_at desc);

drop policy if exists "Residents can view active announcements" on public.announcements;

create policy "Residents can view active announcements"
on public.announcements
for select
to authenticated
using (
  archived = false
  and is_published = true
  and published_at <= now()
  and (expires_at is null or expires_at > now())
  and exists (
    select 1
    from public.residents resident
    where resident.user_id = auth.uid()
      and (announcements.audience = 'all' or announcements.audience = resident.status)
  )
);

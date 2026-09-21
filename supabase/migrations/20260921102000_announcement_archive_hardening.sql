create index if not exists announcements_archived_by_idx
  on public.announcements (archived_by)
  where archived_by is not null;

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
    where resident.user_id = (select auth.uid())
      and (announcements.audience = 'all' or announcements.audience = resident.status)
  )
);

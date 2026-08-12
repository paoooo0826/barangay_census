
begin;

-- The form already sends this field. This statement is safe if the column exists.
alter table public.residents
  add column if not exists monthly_rent numeric(12,2);

alter table public.residents
  drop constraint if exists residents_monthly_rent_check;

alter table public.residents
  add constraint residents_monthly_rent_check
  check (monthly_rent is null or monthly_rent >= 0);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  message text not null check (char_length(btrim(message)) between 5 and 2000),
  priority text not null default 'info'
    check (priority in ('info', 'important', 'urgent')),
  audience text not null default 'all'
    check (audience in ('all', 'pending_review', 'verified', 'returned', 'rejected')),
  is_published boolean not null default true,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references public.admin_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > published_at)
);

create index if not exists announcements_resident_feed_idx
  on public.announcements (is_published, published_at desc);

alter table public.announcements enable row level security;

drop policy if exists "Active admins can view announcements" on public.announcements;
create policy "Active admins can view announcements"
on public.announcements
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_profiles admin
    where admin.user_id = auth.uid()
      and coalesce(admin.is_active, true) = true
  )
);

drop policy if exists "Residents can view active announcements" on public.announcements;
create policy "Residents can view active announcements"
on public.announcements
for select
to authenticated
using (
  is_published = true
  and published_at <= now()
  and (expires_at is null or expires_at > now())
  and exists (
    select 1
    from public.residents resident
    where resident.user_id = auth.uid()
      and (
        announcements.audience = 'all'
        or announcements.audience = resident.status::text
      )
  )
);

drop policy if exists "Active admins can create announcements" on public.announcements;
create policy "Active admins can create announcements"
on public.announcements
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_profiles admin
    where admin.user_id = auth.uid()
      and coalesce(admin.is_active, true) = true
      and (announcements.created_by is null or announcements.created_by = admin.id)
  )
);

drop policy if exists "Active admins can update announcements" on public.announcements;
create policy "Active admins can update announcements"
on public.announcements
for update
to authenticated
using (
  exists (
    select 1
    from public.admin_profiles admin
    where admin.user_id = auth.uid()
      and coalesce(admin.is_active, true) = true
  )
)
with check (
  exists (
    select 1
    from public.admin_profiles admin
    where admin.user_id = auth.uid()
      and coalesce(admin.is_active, true) = true
      and (announcements.created_by is null or announcements.created_by = admin.id)
  )
);

drop policy if exists "Active admins can delete announcements" on public.announcements;
create policy "Active admins can delete announcements"
on public.announcements
for delete
to authenticated
using (
  exists (
    select 1
    from public.admin_profiles admin
    where admin.user_id = auth.uid()
      and coalesce(admin.is_active, true) = true
  )
);

commit;

notify pgrst, 'reload schema';

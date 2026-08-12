-- Run this once in Supabase SQL Editor.
-- It fixes resident census submission/update permissions for related tables.

alter table public.residents enable row level security;
alter table public.resident_categories enable row level security;
alter table public.government_ids enable row level security;
alter table public.face_verifications enable row level security;

-- A user must have only one census record.
create unique index if not exists residents_user_id_unique
on public.residents (user_id);

-- Residents: own row access.
drop policy if exists "Residents insert own census record" on public.residents;
create policy "Residents insert own census record"
on public.residents for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Residents update own census record" on public.residents;
create policy "Residents update own census record"
on public.residents for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Residents view own census record" on public.residents;
create policy "Residents view own census record"
on public.residents for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.admin_profiles
    where admin_profiles.user_id = auth.uid()
      and coalesce(admin_profiles.is_active, true) = true
  )
);

-- Resident categories: allow residents to manage categories for their own row.
drop policy if exists "Residents view own categories" on public.resident_categories;
create policy "Residents view own categories"
on public.resident_categories for select
to authenticated
using (
  exists (
    select 1 from public.residents r
    where r.id = resident_categories.resident_id
      and r.user_id = auth.uid()
  )
  or exists (
    select 1 from public.admin_profiles a
    where a.user_id = auth.uid()
      and coalesce(a.is_active, true) = true
  )
);

drop policy if exists "Residents insert own categories" on public.resident_categories;
create policy "Residents insert own categories"
on public.resident_categories for insert
to authenticated
with check (
  exists (
    select 1 from public.residents r
    where r.id = resident_categories.resident_id
      and r.user_id = auth.uid()
  )
);

drop policy if exists "Residents delete own categories" on public.resident_categories;
create policy "Residents delete own categories"
on public.resident_categories for delete
to authenticated
using (
  exists (
    select 1 from public.residents r
    where r.id = resident_categories.resident_id
      and r.user_id = auth.uid()
  )
);

-- Government ID metadata.
drop policy if exists "Residents view own government id" on public.government_ids;
create policy "Residents view own government id"
on public.government_ids for select
to authenticated
using (
  exists (
    select 1 from public.residents r
    where r.id = government_ids.resident_id
      and r.user_id = auth.uid()
  )
  or exists (
    select 1 from public.admin_profiles a
    where a.user_id = auth.uid()
      and coalesce(a.is_active, true) = true
  )
);

drop policy if exists "Residents insert own government id" on public.government_ids;
create policy "Residents insert own government id"
on public.government_ids for insert
to authenticated
with check (
  exists (
    select 1 from public.residents r
    where r.id = government_ids.resident_id
      and r.user_id = auth.uid()
  )
);

drop policy if exists "Residents update own government id" on public.government_ids;
create policy "Residents update own government id"
on public.government_ids for update
to authenticated
using (
  exists (
    select 1 from public.residents r
    where r.id = government_ids.resident_id
      and r.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.residents r
    where r.id = government_ids.resident_id
      and r.user_id = auth.uid()
  )
);

-- Face-verification metadata.
drop policy if exists "Residents view own face verification" on public.face_verifications;
create policy "Residents view own face verification"
on public.face_verifications for select
to authenticated
using (
  exists (
    select 1 from public.residents r
    where r.id = face_verifications.resident_id
      and r.user_id = auth.uid()
  )
  or exists (
    select 1 from public.admin_profiles a
    where a.user_id = auth.uid()
      and coalesce(a.is_active, true) = true
  )
);

drop policy if exists "Residents insert own face verification" on public.face_verifications;
create policy "Residents insert own face verification"
on public.face_verifications for insert
to authenticated
with check (
  exists (
    select 1 from public.residents r
    where r.id = face_verifications.resident_id
      and r.user_id = auth.uid()
  )
);

drop policy if exists "Residents update own face verification" on public.face_verifications;
create policy "Residents update own face verification"
on public.face_verifications for update
to authenticated
using (
  exists (
    select 1 from public.residents r
    where r.id = face_verifications.resident_id
      and r.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.residents r
    where r.id = face_verifications.resident_id
      and r.user_id = auth.uid()
  )
);

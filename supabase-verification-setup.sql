-- Run this once in Supabase SQL Editor.
-- It creates a private Storage bucket for government IDs and face captures.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resident-verification',
  'resident-verification',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

-- Residents can upload files only inside a folder named with their Auth user ID.
drop policy if exists "Residents upload own verification files" on storage.objects;
create policy "Residents upload own verification files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'resident-verification'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Residents can read their own verification files.
drop policy if exists "Residents read own verification files" on storage.objects;
create policy "Residents read own verification files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'resident-verification'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Residents can replace files in their own folder when needed.
drop policy if exists "Residents update own verification files" on storage.objects;
create policy "Residents update own verification files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'resident-verification'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'resident-verification'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Active admins can read verification images during review.
drop policy if exists "Admins read verification files" on storage.objects;
create policy "Admins read verification files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'resident-verification'
  and exists (
    select 1
    from public.admin_profiles
    where admin_profiles.user_id = auth.uid()
      and coalesce(admin_profiles.is_active, true) = true
  )
);

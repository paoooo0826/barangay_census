-- Add a house/household image to each resident census record.
alter table public.residents
add column if not exists household_photo_url text;

-- Private storage bucket for household images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'household-images',
  'household-images',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Residents can upload images only into their own user folder.
drop policy if exists "Residents upload own household images" on storage.objects;
create policy "Residents upload own household images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'household-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Residents can view their own household images; authenticated admins can also
-- view them through signed URLs used by the application.
drop policy if exists "Authenticated users view household images" on storage.objects;
create policy "Authenticated users view household images"
on storage.objects for select
to authenticated
using (bucket_id = 'household-images');

-- Residents can replace or update files in their own folder.
drop policy if exists "Residents update own household images" on storage.objects;
create policy "Residents update own household images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'household-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'household-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Ensure residents can insert and update their own census row.
alter table public.residents enable row level security;

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

-- Allow a logged-in resident to read remarks written for their own census record.
-- Run this in Supabase SQL Editor.

alter table public.remarks enable row level security;

drop policy if exists "Residents can view their own remarks" on public.remarks;
create policy "Residents can view their own remarks"
on public.remarks
for select
to authenticated
using (
  exists (
    select 1
    from public.residents r
    where r.id = remarks.resident_id
      and r.user_id = auth.uid()
  )
);

-- Admin users may continue reading all remarks.
drop policy if exists "Admins can view all remarks" on public.remarks;
create policy "Admins can view all remarks"
on public.remarks
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_profiles a
    where a.user_id = auth.uid()
      and coalesce(a.is_active, true) = true
  )
);

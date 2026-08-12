-- Run this file once in the Supabase SQL Editor.
-- It makes the single liveness/no-webcam census submission compatible with the database.

-- A skipped camera verification has no captured face file, so this must allow NULL.
alter table public.face_verifications
  alter column captured_face_url drop not null;

-- Add all fields used by the current CensusForm and AdminReview pages.
alter table public.face_verifications
  add column if not exists match_distance double precision,
  add column if not exists similarity_score double precision,
  add column if not exists liveness_passed boolean not null default false,
  add column if not exists liveness_actions jsonb not null default '[]'::jsonb,
  add column if not exists verification_recommendation text,
  add column if not exists id_quality jsonb not null default '{}'::jsonb,
  add column if not exists verification_status text default 'passed',
  add column if not exists verification_reason text,
  add column if not exists device_type text;

-- Safely recreate the verification-status constraint.
alter table public.face_verifications
  drop constraint if exists face_verifications_verification_status_check;

alter table public.face_verifications
  add constraint face_verifications_verification_status_check
  check (verification_status in ('passed', 'skipped'));

-- Keep one government ID and one verification row per resident.
create unique index if not exists government_ids_resident_id_unique
  on public.government_ids (resident_id);

create unique index if not exists face_verifications_resident_id_unique
  on public.face_verifications (resident_id);

-- Refresh PostgREST's schema cache after applying the migration.
notify pgrst, 'reload schema';

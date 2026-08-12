-- Run in Supabase SQL Editor after the existing verification setup.
alter table public.face_verifications
  add column if not exists match_distance double precision,
  add column if not exists similarity_score double precision,
  add column if not exists liveness_passed boolean not null default false,
  add column if not exists liveness_actions jsonb not null default '[]'::jsonb,
  add column if not exists verification_recommendation text,
  add column if not exists id_quality jsonb not null default '{}'::jsonb;

comment on column public.face_verifications.match_distance is 'Euclidean descriptor distance; lower means more similar.';
comment on column public.face_verifications.similarity_score is 'UI indicator derived from distance, not a probability.';
comment on column public.face_verifications.liveness_passed is 'Whether randomized live camera actions were completed.';

-- Camera/liveness exception metadata
alter table public.face_verifications
  add column if not exists verification_status text default 'passed'
    check (verification_status in ('passed', 'skipped')),
  add column if not exists verification_reason text,
  add column if not exists device_type text;

-- No-webcam submissions have no captured face file.
alter table public.face_verifications
  alter column captured_face_url drop not null;

notify pgrst, 'reload schema';

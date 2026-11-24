-- Keep older opened signup screens working, but do not reveal Auth account
-- membership or apply a second rate limiter before Supabase Auth.
-- Current clients validate the format locally and no longer call this RPC.
create or replace function public.check_registration_email(candidate_email text)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'valid', pg_catalog.char_length(email) between 1 and 254
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$',
    'registered', false,
    'rate_limited', false
  )
  from (select pg_catalog.btrim(coalesce(candidate_email, '')) as email) as input;
$$;

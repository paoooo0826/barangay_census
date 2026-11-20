-- Additive aggregate report. Existing routes, RLS and analytics RPC are unchanged.
create function public.admin_planning_analytics(
 p_year integer default extract(year from now() at time zone 'Asia/Manila')::integer,
 p_compare_year integer default null, p_barangay text default null,
 p_census_year integer default null, p_status text default 'verified'
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Manila')::date; civil jsonb; annual jsonb; monthly jsonb; areas jsonb; years jsonb; excluded bigint; stays bigint;
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Administrator access is required.' using errcode='42501'; end if;
 if p_year is null or p_year not between 1900 and extract(year from today)::integer or
   (p_compare_year is not null and p_compare_year not between 1900 and extract(year from today)::integer) or
   (p_census_year is not null and p_census_year not between 1900 and extract(year from today)::integer) or
   p_status is null or p_status not in ('all','verified','pending_review','returned','rejected') then
   raise exception 'Choose a valid year and resident status.' using errcode='22023'; end if;
 with latest as (select distinct on(coalesce(user_id,id)) * from public.residents order by coalesce(user_id,id),updated_at desc nulls last,id),
 cohort as (select * from latest where (p_status='all' or status=p_status) and (p_barangay is null or lower(trim(barangay))=lower(trim(p_barangay))) and
 (p_census_year is null or extract(year from coalesce(submitted_at,created_at) at time zone 'Asia/Manila')=p_census_year)),
 counts as (select case lower(trim(coalesce(civil_status,''))) when 'single' then 'Single' when 'married' then 'Married' when 'widow' then 'Widowed' when 'widower' then 'Widowed' when 'widowed' then 'Widowed' when 'separated' then 'Separated' when 'divorced' then 'Divorced' when 'annulled' then 'Annulled' when '' then 'Not specified' else initcap(trim(civil_status)) end label,count(*) count from cohort group by 1),
 labels as (select unnest(array['Single','Married','Widowed','Separated','Divorced']) label union select label from counts)
 select coalesce(jsonb_agg(jsonb_build_object('label',l.label,'count',coalesce(c.count,0)) order by l.label),'[]') into civil from labels l left join counts c using(label);
 -- Submission dates are a proxy, not annual population snapshots. Coverage cannot
 -- be certified from the first/last date alone, so historical years are unconfirmed.
 with latest as (select distinct on(coalesce(user_id,id)) * from public.residents order by coalesce(user_id,id),updated_at desc nulls last,id),
 cohort as (select *,extract(year from coalesce(submitted_at,created_at) at time zone 'Asia/Manila')::integer yr from latest where status='verified' and (p_barangay is null or lower(trim(barangay))=lower(trim(p_barangay)))),
 counts as (select yr,count(*) count from cohort where yr between 1900 and extract(year from today)::integer group by yr),
 sequence as (select generate_series((select min(yr) from counts),extract(year from today)::integer) yr)
 select coalesce(jsonb_agg(jsonb_build_object('year',s.yr,'count',c.count,'coverage',case when s.yr=extract(year from today)::integer then 'partial' when c.count is null then 'missing' else 'unconfirmed' end,'age','{}'::jsonb) order by s.yr),'[]') into annual from sequence s left join counts c using(yr);
 with latest as (select distinct on(coalesce(user_id,id)) * from public.residents order by coalesce(user_id,id),updated_at desc nulls last,id)
 select (select count(*) from public.residents)-(select count(*) from latest) into excluded;
 with scoped as (select s.*,coalesce(r.user_id,s.resident_id) account from public.boarder_stays s join public.residents r on r.id=s.resident_id
   where p_barangay is null or lower(trim(r.barangay))=lower(trim(p_barangay))),
 months as (select yr,make_date(yr,m,1) first_day,m from (select p_year yr union select p_compare_year where p_compare_year is not null) y cross join generate_series(1,12) m),
 values as (select yr,m,first_day,
   case when first_day>today then null else (select count(distinct account) from scoped where move_in_date>=first_day and move_in_date<first_day+interval '1 month' and move_in_date<=today) end arrivals,
   case when first_day>today then null else (select count(distinct account) from scoped where move_in_date<first_day+interval '1 month' and move_in_date<=today and (departure_date is null or departure_date>greatest(first_day,move_in_date))) end active
   from months)
 select jsonb_agg(jsonb_build_object('year',yr,'month',m,'newBoarders',arrivals,'activeBoarders',active,'partial',first_day=date_trunc('month',today)::date) order by yr,m) into monthly from values;
 select count(*) into stays from public.boarder_stays s join public.residents r on r.id=s.resident_id where (p_barangay is null or lower(trim(r.barangay))=lower(trim(p_barangay))) and s.move_in_date<=today;
 select coalesce(jsonb_agg(label order by label),'[]') into areas from (select distinct trim(barangay) label from public.residents where nullif(trim(barangay),'') is not null) x;
 select coalesce(jsonb_agg(yr order by yr desc),'[]') into years from (select extract(year from today)::integer yr union select extract(year from coalesce(submitted_at,created_at) at time zone 'Asia/Manila')::integer from public.residents union select extract(year from move_in_date)::integer from public.boarder_stays) x where yr between 1900 and extract(year from today)::integer;
 return jsonb_build_object('generatedAt',statement_timestamp(),'reportDate',today,'civil',civil,'annual',annual,'monthly',monthly,'barangays',areas,'years',years,'duplicateRecords',excluded,'datedStays',stays,'annualSource','verified_submissions','populationSnapshotsAvailable',false,'inquiriesAvailable',false);
end $$;
revoke all on function public.admin_planning_analytics(integer,integer,text,integer,text) from public,anon;
grant execute on function public.admin_planning_analytics(integer,integer,text,integer,text) to authenticated;

-- One revision number invalidates aggregates without streaming resident or ID data.
create table public.analytics_refresh_state(id integer primary key check(id=1),revision bigint not null default 0);
insert into public.analytics_refresh_state(id) values(1);
alter table public.analytics_refresh_state enable row level security;
create policy admin_analytics_revision on public.analytics_refresh_state for select to authenticated using((select public.is_active_admin()));
revoke all on public.analytics_refresh_state from anon,authenticated;
grant select on public.analytics_refresh_state to authenticated;
create function private.bump_analytics_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin update public.analytics_refresh_state set revision=revision+1 where id=1; return null; end $$;
revoke all on function private.bump_analytics_revision() from public,anon,authenticated;
do $$ declare tbl text; begin
 foreach tbl in array array['residents','resident_categories','categories','boarder_stays','boarding_houses','boarding_count_events','appointments','service_payments','announcements','incident_reports','resident_feedback','boarding_messages','government_ids','face_verifications','residency_periods'] loop
 execute format('create trigger planning_analytics_changed after insert or update or delete on public.%I for each statement execute function private.bump_analytics_revision()',tbl);
 end loop;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='analytics_refresh_state') then
 alter publication supabase_realtime add table public.analytics_refresh_state;
 end if;
end $$;

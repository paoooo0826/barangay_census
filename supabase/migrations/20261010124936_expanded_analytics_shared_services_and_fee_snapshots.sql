create table public.service_catalog (
 code text primary key check (code in ('barangay_clearance','certificate_of_residency')),
 label text not null, description text not null,
 base_fee numeric not null check(base_fee >= 0 and base_fee::text not in ('NaN','Infinity','-Infinity')),
 student_fee numeric check(student_fee >= 0 and student_fee::text not in ('NaN','Infinity','-Infinity')),
 requirements text not null, processing text not null, purposes jsonb not null default '[]'
);
alter table public.service_catalog enable row level security;
create policy "Signed in accounts can read service information" on public.service_catalog for select to authenticated using (true);
revoke all on public.service_catalog from anon,authenticated;
grant select on public.service_catalog to authenticated;
insert into public.service_catalog values
 ('barangay_clearance','Barangay Clearance','Request a clearance for employment, business, or other legal purposes.',230,130,'Complete your census record, choose a date and time, and describe your request. Additional documentary requirements have not been configured; ask the barangay office.','Weekday appointment slots are available in the booking form. An official processing duration has not been configured.','[]'),
 ('certificate_of_residency','Certificate of Residency','Request a residency certificate for one of the supported purposes.',30,null,'Complete your census record, choose a supported purpose, date and time, and describe your request. Additional documentary requirements have not been configured; ask the barangay office.','Weekday appointment slots are available in the booking form. An official processing duration has not been configured.','[{"value":"low_income","label":"Low Income"},{"value":"good_moral","label":"Good Moral Certificate"},{"value":"financial","label":"Financial"},{"value":"medical_assistance","label":"Medical Assistance Certificate"}]');
create function public.get_service_catalog() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(c) order by code),'[]') from public.service_catalog c;
$$;
revoke all on function public.get_service_catalog() from public,anon;
grant execute on function public.get_service_catalog() to authenticated;

create or replace function public.preview_appointment_fee(p_resident_id uuid,p_service_type text,p_service_purpose text default null) returns numeric language plpgsql stable security definer set search_path='' as $$
declare resident_user uuid; education_status text; catalog public.service_catalog%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication is required.' using errcode='42501'; end if;
 select r.user_id,r.education_status into resident_user,education_status from public.residents r where r.id=p_resident_id;
 if resident_user is null then raise exception 'Resident record not found.' using errcode='P0002'; end if;
 if resident_user<>auth.uid() and not public.is_active_admin() then raise exception 'Access denied.' using errcode='42501'; end if;
 select * into catalog from public.service_catalog where code=p_service_type;
 if catalog.code is null then raise exception 'Unsupported service type.' using errcode='22023'; end if;
 if p_service_type='barangay_clearance' then
   return case when lower(coalesce(education_status,''))='currently studying' then catalog.student_fee else catalog.base_fee end;
 end if;
 if p_service_purpose is null or not exists(select 1 from jsonb_array_elements(catalog.purposes) x where x->>'value'=p_service_purpose) then
   raise exception 'A valid residency certificate purpose is required.' using errcode='22023'; end if;
 if p_service_purpose='low_income' and not exists(select 1 from public.appointments a where a.resident_id=p_resident_id and a.service_type='certificate_of_residency' and a.service_purpose='low_income') then return 0; end if;
 return catalog.base_fee;
end; $$;

create function public.preserve_applied_appointment_fee() returns trigger language plpgsql set search_path='' as $$
begin
 if new.fee is null or new.fee<0 or new.fee::text in ('NaN','Infinity','-Infinity') then raise exception 'A valid nonnegative fee is required.' using errcode='22023'; end if;
 if tg_op='UPDATE' and (new.fee is distinct from old.fee or new.service_type is distinct from old.service_type or new.service_purpose is distinct from old.service_purpose or new.resident_id is distinct from old.resident_id or new.user_id is distinct from old.user_id) then
   raise exception 'The service, owner, and fee applied to an existing request are preserved.' using errcode='22023'; end if;
 return new;
end; $$;
create trigger z_preserve_applied_appointment_fee before insert or update on public.appointments for each row execute function public.preserve_applied_appointment_fee();
revoke all on function public.preserve_applied_appointment_fee() from public,anon,authenticated;

create function public.admin_system_analytics(p_from date default null,p_to date default null,p_status text default 'all') returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare charts jsonb:='[]'; rows jsonb; d record; condition text; cohort text; result jsonb;
begin
 if auth.uid() is null or not public.is_active_admin() then raise exception 'Administrator access is required.' using errcode='42501'; end if;
 if p_from>p_to then raise exception 'The start date must precede the end date.' using errcode='22023'; end if;
 if p_status not in ('all','verified','pending_review','returned','rejected') then raise exception 'Invalid resident status.' using errcode='22023'; end if;
 cohort := case when p_status='all' then 'true' else format('status=%L',p_status) end;
 -- Every source and grouping expression below is a fixed internal whitelist.
 for d in select * from (values
 ('Residents','Residents by Registration Status','resident_set','coalesce(nullif(trim(status),''''),''Not specified'')','',false,'residents'),
 ('Demographics','Residents by Age Group','resident_set','case when birth_date is null or birth_date > (now() at time zone ''Asia/Manila'')::date or birth_date < (now() at time zone ''Asia/Manila'')::date - interval ''130 years'' then ''Unknown / invalid'' when extract(year from age((now() at time zone ''Asia/Manila'')::date,birth_date))<18 then ''0–17 years'' when extract(year from age((now() at time zone ''Asia/Manila'')::date,birth_date))<=30 then ''18–30 years'' when extract(year from age((now() at time zone ''Asia/Manila'')::date,birth_date))<60 then ''31–59 years'' else ''60+ years'' end','',false,'residents'),
 ('Demographics','Residents by Sex','resident_set','coalesce(nullif(trim(sex),''''),''Not specified'')','',false,'residents'),
 ('Demographics','Residents by Civil Status','resident_set','coalesce(nullif(trim(civil_status),''''),''Not specified'')','',false,'residents'),
 ('Demographics','Residents by Religion','resident_set','coalesce(nullif(trim(religion),''''),''Not specified'')','',false,'residents'),
 ('Demographics','Residents by Citizenship','resident_set','coalesce(nullif(trim(citizenship),''''),''Not specified'')','',false,'residents'),
 ('Education and Work','Residents by Highest Education','resident_set','coalesce(nullif(trim(highest_education),''''),''Not specified'')','',false,'residents'),
 ('Education and Work','Residents by Education Status','resident_set','coalesce(nullif(trim(education_status),''''),''Not specified'')','',false,'residents'),
 ('Education and Work','Residents by Reported Occupation Group','resident_set','case when nullif(trim(profession_occupation),'''') is null then ''Not specified'' when lower(profession_occupation) ~ ''student|studying'' then ''Student'' when lower(profession_occupation) ~ ''unemployed|none|no occupation'' then ''No reported employment'' when lower(profession_occupation) ~ ''retired|pension'' then ''Retired'' when lower(profession_occupation) ~ ''housewife|homemaker|househusband'' then ''Homemaker'' when lower(profession_occupation) ~ ''self.employed|business|entrepreneur|freelance'' then ''Self employed / business'' else ''Other reported occupation'' end','',false,'residents'),
 ('Housing and Residency','Residents by Housing Arrangement','resident_set','coalesce(nullif(trim(tenurial_status),''''),''Not specified'')','',false,'residents'),
 ('Housing and Residency','Residents by Monthly Rent Range','resident_set','case when monthly_rent is null then ''Not specified'' when monthly_rent=0 then ''₱0'' when monthly_rent<0 then ''Invalid value'' when monthly_rent<3000 then ''₱1–2,999'' when monthly_rent<6000 then ''₱3,000–5,999'' when monthly_rent<10000 then ''₱6,000–9,999'' else ''₱10,000+'' end','',false,'residents'),
 ('Housing and Residency','Household Photo Coverage','resident_set','case when nullif(household_photo_url,'''') is null then ''No photo'' else ''Photo provided'' end','',false,'residents'),
 ('Housing and Residency','Residents by Boarding Role','resident_set','coalesce(nullif(trim(boarding_status),''''),''Not specified'')','',false,'residents'),
 ('Housing and Residency','Current Residency Classifications','public.residency_current','coalesce(nullif(current_classification,''''),''Not specified'')','',false,'residency periods'),
 ('Boarders','Boarding Houses by Active Status','public.boarding_houses','case when active then ''Active'' else ''Inactive'' end','',false,'boarding houses'),
 ('Boarders','Boarder Stays by Occupancy Status','public.boarder_stays','coalesce(nullif(status,''''),''Not specified'')','',false,'stays'),
 ('Verification','Residents by ID Verification Status','verification_set','case when government_id is null then ''No ID record'' when id_verified then ''Verified ID'' else ''ID awaiting verification'' end','',false,'residents'),
 ('Verification','Residents by Live Verification Status','verification_set','coalesce(nullif(verification_status,''''),''No live verification record'')','',false,'residents'),
 ('Verification','Live Verification Review Recommendations','verification_set','coalesce(nullif(verification_recommendation,''''),''No recommendation'')','',false,'residents'),
 ('Services and Appointments','Appointments by Status','public.appointments','status','',false,'appointments'),
 ('Services and Appointments','Service Requests by Type','public.appointments','replace(service_type,''_'','' '')','created_at',true,'requests'),
 ('Services and Appointments','Residency Requests by Purpose','public.appointments','coalesce(nullif(replace(service_purpose,''_'','' ''),''''),''Not applicable / legacy'')','created_at',true,'requests'),
 ('Services and Appointments','Appointment Visits by Status','public.appointments','status','appointment_date',true,'appointments'),
 ('Services and Appointments','Service Requests by Applied Fee','public.appointments','case when fee=0 then ''Free'' when fee=30 then ''₱30'' when fee=130 then ''₱130'' when fee=230 then ''₱230'' else ''Other historic fee'' end','created_at',true,'requests'),
 ('Activity','Resident Registrations by Month','resident_set','coalesce(to_char(coalesce(submitted_at,created_at) at time zone ''Asia/Manila'',''YYYY-MM''),''Unknown date'')','coalesce(submitted_at,created_at)',true,'registrations'),
 ('Activity','Resident Verifications by Month','resident_set','coalesce(to_char(verified_at at time zone ''Asia/Manila'',''YYYY-MM''),''Unknown date'')','verified_at',true,'verifications'),
 ('Activity','Service Requests by Month','public.appointments','to_char(created_at at time zone ''Asia/Manila'',''YYYY-MM'')','created_at',true,'requests'),
 ('Activity','Completed Appointments by Month','public.appointments','to_char(completed_at at time zone ''Asia/Manila'',''YYYY-MM'')','completed_at',true,'completions'),
 ('Activity','Cancelled Appointments by Month','public.appointments','to_char(cancelled_at at time zone ''Asia/Manila'',''YYYY-MM'')','cancelled_at',true,'cancellations'),
 ('Activity','Boarder Arrivals by Month','public.boarder_stays','to_char(move_in_date,''YYYY-MM'')','move_in_date',true,'arrivals'),
 ('Activity','Boarder Departures by Month','public.boarder_stays','to_char(departure_date,''YYYY-MM'')','departure_date',true,'departures'),
 ('Payments','Payments by Status','public.service_payments','status','paid_at',true,'payments'),
 ('Announcements','Announcements by Publication State','public.announcements','case when archived then ''Archived'' when not is_published then ''Hidden'' when published_at>now() then ''Scheduled'' when expires_at<=now() then ''Expired'' else ''Published'' end','',false,'announcements'),
 ('Announcements','Announcements by Priority','public.announcements','priority','created_at',true,'announcements'),
 ('Announcements','Announcements by Audience','public.announcements','replace(audience,''_'','' '')','created_at',true,'announcements')
 ) v(section,title,source,expression,date_column,period,unit)
 loop
   condition := case when d.source in ('resident_set','verification_set') then cohort else 'true' end;
   if d.title like 'Completed Appointments%' then condition:=condition||' and status=''completed'''; end if;
   if d.title like 'Cancelled Appointments%' then condition:=condition||' and status=''cancelled'''; end if;
   if d.title='Residency Requests by Purpose' then condition:=condition||' and service_type=''certificate_of_residency'''; end if;
   if d.period then
     if p_from is not null then condition:=condition||format(' and (%s)::timestamptz >= %L::date::timestamp at time zone ''Asia/Manila''',d.date_column,p_from); end if;
     if p_to is not null then condition:=condition||format(' and (%s)::timestamptz < (%L::date+1)::timestamp at time zone ''Asia/Manila''',d.date_column,p_to); end if;
     if d.date_column in ('verified_at','completed_at','cancelled_at','departure_date') then condition:=condition||format(' and %s is not null',d.date_column); end if;
   end if;
   execute format('with resident_set as (select distinct on (user_id) * from public.residents order by user_id,updated_at desc nulls last,id), verification_set as (select r.*,g.id government_id,g.is_verified id_verified,f.verification_status,f.verification_recommendation from resident_set r left join public.government_ids g on g.resident_id=r.id left join public.face_verifications f on f.resident_id=r.id) select coalesce(jsonb_agg(to_jsonb(x) order by label),''[]'') from (select %s label,count(*) count from %s where %s group by 1) x',d.expression,d.source,condition) into rows;
   charts:=charts||jsonb_build_array(jsonb_build_object('section',d.section,'title',d.title,'unit',d.unit,'period',d.period,'kind',case when d.title like '%by Month' then 'trend' when d.title in ('Residents by Sex','Appointments by Status') then 'donut' else 'bar' end,'rows',rows));
 end loop;
 with resident_set as (select distinct on(user_id) * from public.residents order by user_id,updated_at desc nulls last,id)
 select coalesce(jsonb_agg(to_jsonb(x) order by label),'[]') into rows from (select case when c.name='FHONA' then 'Family Head and other needy adults' else c.name end label,count(distinct r.user_id) count from public.categories c left join public.resident_categories rc on rc.category_id=c.id left join resident_set r on r.id=rc.resident_id and (p_status='all' or r.status=p_status) group by c.id,c.name) x;
 charts:=charts||jsonb_build_array(jsonb_build_object('section','Residents','title','Residents by Selected Category','unit','residents','period',false,'kind','bar','rows',rows,'note','Residents may select several categories. Each resident is counted once per category; category counts can exceed the resident total.'));
 select jsonb_build_object('residentTotal',count(distinct user_id),'recordTotal',count(*),'duplicateRecords',count(*)-count(distinct user_id),'addressGroups',count(distinct lower(regexp_replace(trim(residential_address),'\s+',' ','g')))) into result from public.residents;
 return result||jsonb_build_object('charts',charts,'postedPayments', (select coalesce(sum(amount),0) from public.service_payments where status='posted' and (p_from is null or paid_at >= p_from::timestamp at time zone 'Asia/Manila') and (p_to is null or paid_at < (p_to+1)::timestamp at time zone 'Asia/Manila')));
end; $$;
revoke all on function public.admin_system_analytics(date,date,text) from public,anon;
grant execute on function public.admin_system_analytics(date,date,text) to authenticated;

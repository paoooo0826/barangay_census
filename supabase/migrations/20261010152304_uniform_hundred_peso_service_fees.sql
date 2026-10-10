-- Standardize new paid requests at the user-confirmed ₱100 rate.
-- Preserve the existing first Low Income exemption and saved appointment fees.
update public.service_catalog
set base_fee=100,
    student_fee=case when code='barangay_clearance' then 100 else student_fee end
where code in ('barangay_clearance','certificate_of_residency');

-- Revise only the fee chart; retain the existing authorization and other charts.
do $migration$
declare definition text:=pg_get_functiondef('public.admin_system_analytics(date,date,text)'::regprocedure);
begin
 if strpos(definition,$old_expression$case when fee=0 then ''Free'' when fee=30 then ''₱30'' when fee=130 then ''₱130'' when fee=230 then ''₱230'' else ''Other historic fee'' end$old_expression$)=0 then
   raise exception 'Unexpected analytics fee expression; review before changing prices.';
 end if;
 if strpos(definition,$old_row$'rows',rows));$old_row$)=0 then
   raise exception 'Unexpected analytics chart construction; review before changing prices.';
 end if;
 definition:=replace(definition,$old_expression$case when fee=0 then ''Free'' when fee=30 then ''₱30'' when fee=130 then ''₱130'' when fee=230 then ''₱230'' else ''Other historic fee'' end$old_expression$,$new_expression$case when fee=0 then ''Free'' else ''₱''||trim(trailing ''.'' from trim(trailing ''0'' from to_char(fee,''FM999999999990.00'')))||case when exists(select 1 from public.service_catalog c where fee in (c.base_fee,c.student_fee)) then '''' else '' (Historical)'' end end$new_expression$);
 definition:=replace(definition,'Service Requests by Applied Fee','Service Requests by Saved Fee');
 definition:=replace(definition,$old_row$'rows',rows));$old_row$,$new_row$'rows',rows) || case when d.title='Service Requests by Saved Fee' then jsonb_build_object('note','Fees are saved when a request is booked. Amounts marked Historical use earlier pricing; check Services and Approved Fees for current rates.') else '{}'::jsonb end);$new_row$);
 execute definition;
end;
$migration$;

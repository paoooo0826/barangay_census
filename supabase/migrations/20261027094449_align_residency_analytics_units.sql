do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.admin_system_analytics(date,date,text)'::regprocedure) into definition;
 if position('false,''residency periods''))' in definition)>0 then raise exception 'Unexpected analytics definition'; end if;
 definition:=replace(definition,'false,''residency periods'')','false,''residents'')');
 execute definition;
end $migration$;


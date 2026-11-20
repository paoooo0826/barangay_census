-- In a rollback-only transaction after the first 17 lines of verify-brims.sql
-- and the landlord_chat_profile_names migration. Never persist these fixtures.
reset role;
update public.residents set first_name='Saved',middle_name=null,last_name='Landlord',birth_date=case when id=(select id from brims_test_ids where label='landlord') then '2000-01-01'::date else '2001-01-01'::date end where id in(select id from brims_test_ids where label in ('landlord','landlord2'));
update public.boarding_houses set owner_name='Old Name Snapshot' where id in(select id from brims_test_ids where label in ('house','house2'));
set local role authenticated;
do $test$ declare v jsonb; h uuid; uid uuid;
begin
 select id into h from brims_test_ids where label='house'; select id into uid from brims_test_ids where label='landlord';
 perform pg_temp.become('landlord');
 v:=public.boarding_conversations();
 if jsonb_array_length(v)<>1 or v->0->>'owner_name'<>'Saved Landlord' or v->0->>'owner_user_id'<>uid::text or v->0->>'id'<>h::text then raise exception 'Landlord profile name or own-house scope incorrect';end if;
 perform pg_temp.become('landlord2');
 if exists(select 1 from jsonb_array_elements(public.boarding_conversations()) x where x->>'id'=h::text) then raise exception 'Duplicate names merged conversations';end if;
 perform pg_temp.become('resident');
 if jsonb_array_length(public.boarding_conversations())<>0 then raise exception 'Resident accessed private chat names';end if;
 perform pg_temp.become('admin');
 if (select count(*) from jsonb_array_elements(public.boarding_conversations()) x where x->>'owner_name'='Saved Landlord')<>2 then raise exception 'Admin did not receive distinct assigned profile names';end if;
end $test$;
reset role;

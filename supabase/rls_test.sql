-- Run: docker exec -i supabase_db_training-os psql -U postgres -v ON_ERROR_STOP=1 < supabase/rls_test.sql
begin;
insert into auth.users (id,instance_id,aud,role,email) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t1@x.co'),
 ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t2@x.co');
insert into auth.users (id,instance_id,aud,role,email,raw_app_meta_data) select
 ('00000000-0000-0000-0000-00000000c'||lpad(i::text,3,'0'))::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','c'||i||'@x.co','{"role":"client"}'::jsonb from generate_series(1,22) i;
-- GoTrue sets app_metadata after insert; simulate that second step
update auth.users set raw_app_meta_data = raw_app_meta_data where email like 'c%@x.co';
-- trial created for trainers only
do $$ begin assert (select count(*) from trainer_subscriptions where trainer_id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2'))=2, 'trial rows'; end $$;
do $$ begin assert (select count(*) from trainer_subscriptions s join profiles p on p.id=s.trainer_id where p.role='client')=0, 'clients must not have trials'; end $$;
do $$ begin assert (select trial_ends_at - trial_started_at from trainer_subscriptions where trainer_id='00000000-0000-0000-0000-0000000000a1') = interval '7 days', '7 day trial'; end $$;
-- capacity: 20 allowed, 21st rejected
insert into trainer_client_relationships (trainer_id,client_id) select '00000000-0000-0000-0000-0000000000a1', id from profiles where role='client' and id::text like '00000000-0000-0000-0000-00000000c%' order by id limit 20;
do $$ begin
  begin
    insert into trainer_client_relationships (trainer_id,client_id) select '00000000-0000-0000-0000-0000000000a1', id from profiles where role='client' and id::text like '00000000-0000-0000-0000-00000000c%' order by id offset 20 limit 1;
    raise exception 'FAIL: 21st client allowed';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
-- approved slot purchase raises capacity
insert into slot_purchases (trainer_id,provider,provider_reference,quantity,unit_price_cents,total_cents,status,slots_granted)
 values ('00000000-0000-0000-0000-0000000000a1','wompi','tx-1',2,75,150,'approved',true);
insert into trainer_client_relationships (trainer_id,client_id) select '00000000-0000-0000-0000-0000000000a1', id from profiles where role='client' and id::text like '00000000-0000-0000-0000-00000000c%' order by id offset 20 limit 2;
-- pending purchase grants nothing
insert into slot_purchases (trainer_id,provider,provider_reference,quantity,unit_price_cents,total_cents,status)
 values ('00000000-0000-0000-0000-0000000000a1','wompi','tx-2',5,75,375,'pending');
do $$ begin assert trainer_capacity('00000000-0000-0000-0000-0000000000a1')=22, 'capacity 22'; end $$;
-- duplicate provider reference rejected
do $$ begin begin
  insert into slot_purchases (trainer_id,provider,provider_reference,quantity,unit_price_cents,total_cents) values ('00000000-0000-0000-0000-0000000000a1','wompi','tx-1',1,75,75);
  raise exception 'FAIL: dup';
exception when unique_violation then null; end; end $$;
-- RLS: trainer 2 sees none of trainer 1's relationships; cannot write when forged
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}',true);
do $$ begin assert (select count(*) from trainer_client_relationships)=0, 'RLS leak rel'; end $$;
do $$ begin assert (select count(*) from slot_purchases)=0, 'RLS leak purchases'; end $$;
do $$ begin begin
  insert into slot_purchases (trainer_id,provider,provider_reference,quantity,unit_price_cents,total_cents,status,slots_granted) values ('00000000-0000-0000-0000-0000000000a2','paypal','x',10,75,750,'approved',true);
  raise exception 'FAIL: client-side grant';
exception when insufficient_privilege then null; end; end $$;
-- Privilege hygiene (migration 0024): no SECURITY DEFINER function in public is callable anonymously, all pin their search_path,
-- and every public table has row level security.
do $$ declare bad text; begin
  select string_agg(p.proname, ', ') into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute');
  assert bad is null, 'SECURITY DEFINER callable by anon: ' || coalesce(bad, '');
  select string_agg(p.proname, ', ') into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  assert bad is null, 'SECURITY DEFINER without search_path: ' || coalesce(bad, '');
  select string_agg(c.relname, ', ') into bad from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  assert bad is null, 'public table without RLS: ' || coalesce(bad, '');
end $$;
select 'RLS/capacity/trial tests OK' as result;
rollback;

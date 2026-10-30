-- AUD-001 follow-up, for signed-in users. Supabase grants `authenticated` every privilege on every table; RLS was the only barrier even on tables
-- that no policy lets anyone write (audit trails, ledgers, limits). Now: no TRUNCATE/TRIGGER/REFERENCES for API roles anywhere, and INSERT /
-- UPDATE / DELETE only where a policy of that kind exists. Reads are untouched. Writes through SECURITY DEFINER functions are unaffected.
do $$
declare t record; c text;
begin
  for t in select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('revoke truncate, trigger, references on public.%I from authenticated, anon', t.relname);
    for c in select unnest(array['INSERT', 'UPDATE', 'DELETE']) loop
      if not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.relname and p.cmd in (c, 'ALL')) then
        execute format('revoke %s on public.%I from authenticated', c, t.relname);
      end if;
    end loop;
  end loop;
end $$;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;

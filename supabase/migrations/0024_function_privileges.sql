-- Hardening found in the final review:
--  1) Anyone holding only the public (publishable) key could call helper functions with an arbitrary uuid and learn another
--     trainer's slot count (trainer_capacity), subscription state (trainer_has_access) or a user's consent state (has_consent).
--  2) Two SECURITY DEFINER functions had no fixed search_path.
-- Signed-in users keep EXECUTE: row-level-security policies call these helpers as the invoking role.

alter function trainer_capacity(uuid) set search_path = public;
alter function enforce_client_capacity() set search_path = public;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;

-- Functions created from now on are not callable by anonymous users unless a migration grants it on purpose.
alter default privileges in schema public revoke execute on functions from public, anon;

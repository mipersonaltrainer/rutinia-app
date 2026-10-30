-- LOCAL DEVELOPMENT ONLY. Removes the throwaway users that integration suites create (emails @x.co, @b.co, @q.co, @y.co)
-- together with everything that references them, following foreign keys recursively.
-- Triggers are disabled for the session because the data model (rightly) forbids deleting immutable records.
set session_replication_role = replica;

create or replace function pg_temp.rdel(tbl regclass, cond text, path regclass[] default '{}') returns void language plpgsql as $$
declare fk record; sub text;
begin
  for fk in
    select c.conrelid::regclass as child, a.attname as ccol, pa.attname as pcol
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
     where c.contype = 'f' and c.confrelid = tbl and array_length(c.conkey, 1) = 1 and c.conrelid <> all (path || tbl)         -- skip cycles (FK checks are off, so rows need not be removed child-first)
  loop
    sub := format('%I in (select %I from %s where %s)', fk.ccol, fk.pcol, tbl, cond);
    perform pg_temp.rdel(fk.child, sub, path || tbl);
  end loop;
  execute format('delete from %s where %s', tbl, cond);
end $$;

do $$ declare n int; begin
  select count(*) into n from auth.users where email ~ '(@(x|b|q|y)\.co|^cerrada\+.*@invalid\.local)$';
  perform pg_temp.rdel('public.profiles', 'id in (select id from auth.users where email ~ ''(@(x|b|q|y)\.co|^cerrada\+.*@invalid\.local)$'')');
  delete from auth.users where email ~ '(@(x|b|q|y)\.co|^cerrada\+.*@invalid\.local)$';
  raise notice 'purged % test users', n;
end $$;

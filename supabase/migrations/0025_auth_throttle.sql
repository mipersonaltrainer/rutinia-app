-- Attempt limiter for sign-up, sign-in, password recovery and password change. Keys are HMACs computed by the server
-- (no e-mail or IP is stored). Service role only.
create table auth_throttle (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);
alter table auth_throttle enable row level security;

-- Counts one attempt and says whether it is within p_limit per p_window_seconds (fixed window). Single statement: the upsert
-- row lock makes concurrent attempts serialize, so N parallel requests can never slip past the limit.
create function auth_throttle_hit(p_key text, p_limit int, p_window_seconds int) returns jsonb language plpgsql security definer set search_path = public as $$
declare r auth_throttle;
begin
  if p_limit < 1 or p_window_seconds < 1 then raise exception 'invalid limit'; end if;
  insert into auth_throttle as t (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when now() - t.window_start >= make_interval(secs => p_window_seconds) then 1 else t.hits + 1 end,
    window_start = case when now() - t.window_start >= make_interval(secs => p_window_seconds) then now() else t.window_start end
  returning * into r;
  return jsonb_build_object('allowed', r.hits <= p_limit, 'hits', r.hits,
    'retry_after', case when r.hits <= p_limit then 0 else greatest(1, ceil(p_window_seconds - extract(epoch from now() - r.window_start))::int) end);
end $$;

create function auth_throttle_clear(p_key text) returns void language sql security definer set search_path = public as $$
  delete from auth_throttle where key = p_key;
$$;

-- Housekeeping, called by the cron: windows are at most a day long, so anything older than two days is dead weight.
create function auth_throttle_purge() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin delete from auth_throttle where window_start < now() - interval '2 days'; get diagnostics n = row_count; return n; end $$;

revoke all on function auth_throttle_hit(text, int, int), auth_throttle_clear(text), auth_throttle_purge() from public, anon, authenticated;
grant execute on function auth_throttle_hit(text, int, int), auth_throttle_clear(text), auth_throttle_purge() to service_role;

-- Operator alerts (the people who run the platform, not trainers or clients): state of each monitored condition and when
-- it was last announced, so a cron that runs every 15 minutes announces a change once and a persisting problem only now and then.
-- Service role only: no policies on the table, execute granted to service_role alone.
create table operator_alerts (
  key text primary key,
  state text not null,
  last_sent_at timestamptz,
  send_count int not null default 0,
  updated_at timestamptz not null default now()
);
alter table operator_alerts enable row level security;

-- Atomically decides whether to announce `p_state` for `p_key`.
--   • first observation as 'ok'                      → remember it, say nothing
--   • state changed (worse, better or recovered)     → announce
--   • same non-'ok' state                            → announce again only after p_repeat_minutes
-- Returns what it replaced so a failed delivery can be undone with revert_operator_alert().
create function claim_operator_alert(p_key text, p_state text, p_repeat_minutes int) returns jsonb language plpgsql security definer set search_path = public as $$
declare cur operator_alerts; announce boolean;
begin
  if p_repeat_minutes < 1 then raise exception 'p_repeat_minutes must be positive'; end if;
  perform pg_advisory_xact_lock(hashtextextended('operator_alert:' || p_key, 0));       -- concurrent cron runs serialize here
  select * into cur from operator_alerts where key = p_key;
  if not found then
    announce := p_state <> 'ok';
    insert into operator_alerts (key, state, last_sent_at, send_count) values (p_key, p_state, case when announce then now() end, case when announce then 1 else 0 end);
    return jsonb_build_object('claimed', announce, 'prev', null);
  end if;
  announce := cur.state <> p_state or (p_state <> 'ok' and now() - cur.last_sent_at >= make_interval(mins => p_repeat_minutes));
  if announce then
    update operator_alerts set state = p_state, last_sent_at = now(), send_count = send_count + 1, updated_at = now() where key = p_key;
  elsif cur.state = p_state then null;
  end if;
  return jsonb_build_object('claimed', announce, 'prev', case when announce then jsonb_build_object('state', cur.state, 'last_sent_at', cur.last_sent_at, 'send_count', cur.send_count) end);
end $$;

-- Undo a claim whose delivery failed, so the next run tries again instead of staying silent for the whole repeat window.
create function revert_operator_alert(p_key text, p_prev jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_prev is null or p_prev = 'null'::jsonb then delete from operator_alerts where key = p_key;
  else update operator_alerts set state = p_prev->>'state', last_sent_at = (p_prev->>'last_sent_at')::timestamptz, send_count = (p_prev->>'send_count')::int, updated_at = now() where key = p_key;
  end if;
end $$;

revoke all on function claim_operator_alert(text, text, int), revert_operator_alert(text, jsonb) from public, anon, authenticated;
grant execute on function claim_operator_alert(text, text, int), revert_operator_alert(text, jsonb) to service_role;

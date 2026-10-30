-- Realtime: Postgres Changes are filtered by the subscriber's RLS, so the existing SELECT policies decide who is told what.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table messages, video_calls, notifications;
  end if;
end $$;

-- Reminders 24 h and 1 h before a scheduled call, to both parties. Idempotent: the notification dedupe key makes a
-- repeated run (cron overlap, retry) a no-op. A reminder is skipped when it would be pointless (call created inside
-- the window), when the call is canceled, or when the pair can no longer talk.
create function send_call_reminders() returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; stage text; n integer := 0; got integer;
        when_txt text;
begin
  for r in select * from video_calls where status = 'scheduled' and scheduled_at > now() and scheduled_at <= now() + interval '24 hours' loop
    if not exists (select 1 from trainer_client_relationships x where x.trainer_id = r.trainer_id and x.client_id = r.client_id and x.status = 'active') then continue; end if;
    when_txt := to_char(r.scheduled_at at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI') || ' (hora Colombia)';
    foreach stage in array array['24h', '1h'] loop
      if stage = '24h' and (r.created_at >= r.scheduled_at - interval '24 hours') then continue; end if;
      if stage = '1h' and (r.scheduled_at > now() + interval '1 hour' or r.created_at >= r.scheduled_at - interval '1 hour') then continue; end if;
      insert into notifications (user_id, kind, title, body, link, dedupe_key)
        select u.id, 'call_reminder', case stage when '1h' then 'Tu videollamada empieza en menos de 1 hora' else 'Videollamada mañana' end, when_txt,
               case when u.id = r.client_id then '/client/messages' else '/trainer/clients/' || r.client_id::text || '/messages' end,
               'callrem' || stage || ':' || r.id::text
          from (values (r.trainer_id), (r.client_id)) as u(id)
        on conflict (user_id, dedupe_key) do nothing;
      get diagnostics got = row_count; n := n + got;
    end loop;
  end loop;
  return jsonb_build_object('created', n);
end $$;
revoke all on function send_call_reminders() from public, anon, authenticated;
grant execute on function send_call_reminders() to service_role;

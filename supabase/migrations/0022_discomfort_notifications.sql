-- Tell the trainer when a client reports a significant discomfort (>= 6/10) or finishes a session with general pain >= 6/10.
-- The threshold mirrors ATTENTION_THRESHOLD in src/lib/training/metrics.ts (an integration test checks the boundary).
-- Privacy: the notification carries NO health detail (no intensity, area or note) — only who and where to look; the detail
-- stays behind the consents that gate the client's file. Nothing is sent without the client's health_data + share_with_trainer consents.

create function notify_trainer_attention(p_client uuid, p_key text) returns void language plpgsql security definer set search_path = public as $$
declare t record; cname text;
begin
  if (select count(*) from consents k where k.user_id = p_client and k.revoked_at is null and k.type in ('health_data','share_with_trainer')) < 2 then return; end if;
  select full_name into cname from profiles where id = p_client;
  for t in select r.trainer_id from trainer_client_relationships r where r.client_id = p_client and r.status = 'active' loop
    insert into notifications (user_id, kind, title, body, link, dedupe_key)
    values (t.trainer_id, 'attention', 'Molestia importante reportada: ' || coalesce(cname, 'un alumno'),
            'Revisa su ficha para ver los detalles y decidir si ajustar el plan o derivar a un profesional.',
            '/trainer/clients/' || p_client::text, p_key)
    on conflict (user_id, dedupe_key) do nothing;           -- one notification per event, however many times it is edited
  end loop;
end $$;
revoke all on function notify_trainer_attention(uuid, text) from public, anon, authenticated;

create function trg_discomfort_attention() returns trigger language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if new.severity >= 6 then
    select client_id into c from workout_logs where id = new.log_id;
    perform notify_trainer_attention(c, 'discomfort:' || new.log_id::text || ':' || new.exercise_id::text);
  end if;
  return null;
end $$;
create trigger trg_discomfort_attention after insert or update of severity on exercise_discomforts for each row execute function trg_discomfort_attention();

create function trg_pain_attention() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and coalesce(new.pain_level, 0) >= 6 then
    perform notify_trainer_attention(new.client_id, 'pain:' || new.id::text);
  end if;
  return null;
end $$;
create trigger trg_pain_attention after update of status on workout_logs for each row execute function trg_pain_attention();

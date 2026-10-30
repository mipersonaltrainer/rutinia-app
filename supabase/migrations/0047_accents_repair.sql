-- Repair: in production, three objects from 0035 and 0037 were stored with their accented characters garbled (a stray square-root symbol
-- in place of the accent). This migration is plain ASCII on purpose: every accented letter is a Unicode escape (U&'...'), so applying it through any
-- path (CLI, SQL editor, clipboard) cannot garble it again. It is idempotent and safe on a database that never had the problem.

-- 1) The support reply notification: same function as 0035, title written with escapes.
create or replace function support_send(p_thread uuid, p_body text, p_as_staff boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t support_threads; mid uuid; first boolean := false; body text := btrim(coalesce(p_body, ''));
begin
  if me is null then raise exception 'not authenticated'; end if;
  if length(body) not between 1 and 4000 then raise exception 'invalid message length'; end if;
  select * into t from support_threads where id = p_thread for update;
  if not found then raise exception 'forbidden'; end if;
  if p_as_staff then
    if not is_support_staff() then raise exception 'forbidden'; end if;
  elsif t.trainer_id <> me then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended('support:' || me::text, 0));
  if (select count(*) from support_messages where sender_id = me and created_at > now() - interval '1 minute') >= 20 then raise exception 'rate limited'; end if;

  if p_as_staff then
    insert into support_messages (thread_id, sender_id, sender_kind, body) values (t.id, me, 'staff', body) returning id into mid;
    update support_threads set status = 'answered', last_message_at = now(), trainer_unread = trainer_unread + 1, staff_unread = 0 where id = t.id;
    insert into notifications (user_id, kind, title, body, link, dedupe_key)
      values (t.trainer_id, 'support', U&'Soporte te respondi\00F3', t.subject, '/trainer/support/' || t.id::text,
              'support:' || t.id::text || ':' || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24'))   -- one notification per conversation per hour
      on conflict (user_id, dedupe_key) do nothing;
  else
    insert into support_messages (thread_id, sender_id, sender_kind, body) values (t.id, me, 'trainer', body) returning id into mid;
    first := t.staff_unread = 0;
    update support_threads set status = 'open', last_message_at = now(), staff_unread = staff_unread + 1, trainer_unread = 0 where id = t.id;   -- writing again reopens a closed conversation
  end if;
  return jsonb_build_object('id', mid, 'first_unanswered', first);
end $$;

-- 2) The birthday greeting: the column defaults and the single settings row created with them (only if it still holds the garbled text,
--    so a greeting the team has already rewritten is never touched).
alter table marketing_settings alter column birthday_title set default U&'\00A1Feliz cumplea\00F1os, {nombre}! \+01F382';
alter table marketing_settings alter column birthday_body set default U&'Todo el equipo de Rutinia te desea un d\00EDa incre\00EDble. Gracias por entrenar con nosotros y por acompa\00F1ar a tus alumnos.';
update marketing_settings set birthday_title = U&'\00A1Feliz cumplea\00F1os, {nombre}! \+01F382' where birthday_title like U&'%\221A%';
update marketing_settings set birthday_body = U&'Todo el equipo de Rutinia te desea un d\00EDa incre\00EDble. Gracias por entrenar con nosotros y por acompa\00F1ar a tus alumnos.' where birthday_body like U&'%\221A%';

-- 3) Support notifications already stored with the garbled title.
update notifications set title = U&'Soporte te respondi\00F3' where kind = 'support' and title like U&'%\221A%';

-- Support channel: a trainer talks to the Rutinia team (payments, access, permissions, bugs).
-- Same rules as messaging: reads go through RLS, every write goes through a SECURITY DEFINER function that takes the sender from the
-- session, validates, rate-limits and keeps the counters. Support must work even when the trainer's workspace is blocked
-- (an expired subscription is exactly when they need to write), so nothing here calls trainer_has_access.

-- The team. No policy on purpose: nobody can read or write it through the API; the service role (scripts/ops/add-support-staff.mjs)
-- manages it and is_support_staff() reads it.
create table support_staff (
  user_id uuid primary key references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table support_staff enable row level security;
revoke all on support_staff from anon, authenticated;

create function is_support_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from support_staff where user_id = auth.uid())
$$;

create table support_threads (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references profiles(id) on delete cascade,
  category text not null check (category in ('pago', 'acceso', 'permisos', 'error', 'otro')),
  subject text not null check (length(btrim(subject)) between 3 and 120),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  trainer_unread integer not null default 0 check (trainer_unread >= 0),   -- replies from the team the trainer has not opened yet
  staff_unread integer not null default 0 check (staff_unread >= 0)        -- messages from the trainer nobody has answered yet
);
create index on support_threads (trainer_id, last_message_at desc);
create index on support_threads (status, last_message_at desc);

create table support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references support_threads(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  -- 'agent' is reserved for an automatic assistant that answers on behalf of the team (not built yet); the column already tells the two apart.
  sender_kind text not null check (sender_kind in ('trainer', 'staff', 'agent')),
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on support_messages (thread_id, created_at);

alter table support_threads enable row level security;
alter table support_messages enable row level security;
create policy st_select on support_threads for select using (trainer_id = auth.uid() or is_support_staff());
create policy sm_select on support_messages for select using (
  exists (select 1 from support_threads t where t.id = thread_id and (t.trainer_id = auth.uid() or is_support_staff())));
-- The team needs the trainer's name to answer; nothing else about other users.
create policy profiles_support_staff_reads_trainers on profiles for select using (is_support_staff() and role = 'trainer');

-- A trainer opens a conversation. At most 5 open at a time and 10 messages a minute.
create function support_open_thread(p_category text, p_subject text, p_body text) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tid uuid; subj text := btrim(coalesce(p_subject, '')); body text := btrim(coalesce(p_body, ''));
begin
  if me is null or (select role from profiles where id = me) is distinct from 'trainer' then raise exception 'forbidden'; end if;
  if p_category is null or p_category not in ('pago', 'acceso', 'permisos', 'error', 'otro') then raise exception 'invalid category'; end if;
  if length(subj) not between 3 and 120 then raise exception 'invalid subject'; end if;
  if length(body) not between 1 and 4000 then raise exception 'invalid message length'; end if;
  perform pg_advisory_xact_lock(hashtextextended('support:' || me::text, 0));
  if (select count(*) from support_threads where trainer_id = me and status <> 'closed') >= 5 then raise exception 'too many open'; end if;
  if (select count(*) from support_messages where sender_id = me and created_at > now() - interval '1 minute') >= 10 then raise exception 'rate limited'; end if;
  insert into support_threads (trainer_id, category, subject, staff_unread) values (me, p_category, subj, 1) returning id into tid;
  insert into support_messages (thread_id, sender_id, sender_kind, body) values (tid, me, 'trainer', body);
  return tid;
end $$;

-- Adds a message. p_as_staff says in which capacity the caller writes: the owner of a thread who is also on the team (a test account)
-- is never ambiguous. Returns {id, first_unanswered}: the second is true when the trainer's message is the first one nobody has
-- answered yet, which is what the team is alerted about (not every message of a burst).
create function support_send(p_thread uuid, p_body text, p_as_staff boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
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
      values (t.trainer_id, 'support', 'Soporte te respondió', t.subject, '/trainer/support/' || t.id::text,
              'support:' || t.id::text || ':' || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24'))   -- one notification per conversation per hour
      on conflict (user_id, dedupe_key) do nothing;
  else
    insert into support_messages (thread_id, sender_id, sender_kind, body) values (t.id, me, 'trainer', body) returning id into mid;
    first := t.staff_unread = 0;
    update support_threads set status = 'open', last_message_at = now(), staff_unread = staff_unread + 1, trainer_unread = 0 where id = t.id;   -- writing again reopens a closed conversation
  end if;
  return jsonb_build_object('id', mid, 'first_unanswered', first);
end $$;

create function support_mark_read(p_thread uuid, p_as_staff boolean default false) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_as_staff then
    if not is_support_staff() then raise exception 'forbidden'; end if;
    update support_threads set staff_unread = 0 where id = p_thread;
  else
    update support_threads set trainer_unread = 0 where id = p_thread and trainer_id = me;
  end if;
end $$;

-- Close or reopen. The trainer can close their own conversation ("resolved"); the team can close or reopen any.
create function support_set_status(p_thread uuid, p_status text, p_as_staff boolean default false) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_status not in ('open', 'closed') then raise exception 'invalid status'; end if;
  if p_as_staff then
    if not is_support_staff() then raise exception 'forbidden'; end if;
    update support_threads set status = p_status where id = p_thread;
  else
    update support_threads set status = p_status where id = p_thread and trainer_id = me;
  end if;
  if not found then raise exception 'forbidden'; end if;
end $$;

revoke all on function is_support_staff(), support_open_thread(text, text, text), support_send(uuid, text, boolean), support_mark_read(uuid, boolean), support_set_status(uuid, text, boolean) from public, anon;
grant execute on function is_support_staff(), support_open_thread(text, text, text), support_send(uuid, text, boolean), support_mark_read(uuid, boolean), support_set_status(uuid, text, boolean) to authenticated;

-- Realtime: every message touches its thread row, so listening to support_threads is enough; RLS decides who is told what.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table support_threads;
  end if;
end $$;

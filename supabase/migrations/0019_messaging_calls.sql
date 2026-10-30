-- Trainer <-> client messaging and video-call links.
-- No media server: a "call" is a validated link to an external provider chosen from an allowlist.

-- A pair may talk while the relationship is active and the client shares data with the trainer.
-- The sender must additionally be a legitimate party; trainers need an active workspace to write.
create function can_message(p_trainer uuid, p_client uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from trainer_client_relationships r where r.trainer_id = p_trainer and r.client_id = p_client and r.status = 'active')
     and exists (select 1 from consents k where k.user_id = p_client and k.type = 'share_with_trainer' and k.revoked_at is null);
$$;

-- Mirror of src/lib/messaging/links.ts (an integration test keeps both in agreement).
create function is_allowed_call_url(u text) returns boolean language sql immutable as $$
  select u is not null and length(u) <= 500 and u !~ '\s'
     and u ~* '^https://([a-z0-9-]+\.)*(meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com|meet\.jit\.si|whereby\.com)(/[^@\s]*)?$'
$$;

create table messages (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references profiles(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text','call_invite')),
  body text not null check (length(btrim(body)) between 1 and 2000),
  call_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id in (trainer_id, client_id))
);
create index on messages (trainer_id, client_id, created_at desc);
create index on messages (client_id, trainer_id, created_at desc);

create table video_calls (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references profiles(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  url text not null check (is_allowed_call_url(url)),
  scheduled_at timestamptz not null,
  note text check (note is null or length(note) <= 300),
  status text not null default 'scheduled' check (status in ('scheduled','canceled')),
  created_at timestamptz not null default now()
);
create index on video_calls (client_id, scheduled_at);
create index on video_calls (trainer_id, scheduled_at);
alter table messages add constraint messages_call_fk foreign key (call_id) references video_calls(id) on delete set null;

alter table messages enable row level security;
alter table video_calls enable row level security;
-- Reads only; every write goes through the SECURITY DEFINER functions below (messages are immutable).
create policy msg_select on messages for select using (
  (client_id = auth.uid()) or (trainer_id = auth.uid() and can_message(trainer_id, client_id)));
create policy call_select on video_calls for select using (
  (client_id = auth.uid()) or (trainer_id = auth.uid() and can_message(trainer_id, client_id)));

create function send_message(p_peer uuid, p_body text) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); my_role user_role; t uuid; c uuid; mid uuid; body text := btrim(coalesce(p_body, ''));
begin
  if me is null then raise exception 'not authenticated'; end if;
  select role into my_role from profiles where id = me;
  if my_role = 'trainer' then t := me; c := p_peer; elsif my_role = 'client' then t := p_peer; c := me; else raise exception 'forbidden'; end if;
  if length(body) not between 1 and 2000 then raise exception 'invalid message length'; end if;
  if not can_message(t, c) then raise exception 'forbidden'; end if;
  if my_role = 'trainer' and not trainer_has_access(t) then raise exception 'workspace inactive'; end if;
  perform pg_advisory_xact_lock(hashtextextended('msg:' || me::text, 0));
  if (select count(*) from messages where sender_id = me and created_at > now() - interval '1 minute') >= 20 then raise exception 'rate limited'; end if;
  insert into messages (trainer_id, client_id, sender_id, body) values (t, c, me, body) returning id into mid;
  insert into notifications (user_id, kind, title, body, link, dedupe_key)
    select p_peer, 'message', 'Mensaje nuevo', null,
           case when my_role = 'trainer' then '/client/messages' else '/trainer/clients/' || c::text || '/messages' end,
           'msg:' || me::text || ':' || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24')   -- one notification per sender per hour, not one per message
    on conflict (user_id, dedupe_key) do nothing;
  return mid;
end $$;

create function schedule_call(p_client uuid, p_url text, p_when timestamptz, p_note text) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cid uuid; note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if me is null or (select role from profiles where id = me) is distinct from 'trainer' then raise exception 'forbidden'; end if;
  if not can_message(me, p_client) or not trainer_has_access(me) then raise exception 'forbidden'; end if;
  if not is_allowed_call_url(p_url) then raise exception 'link not allowed'; end if;
  if p_when < now() - interval '5 minutes' or p_when > now() + interval '1 year' then raise exception 'invalid date'; end if;
  insert into video_calls (trainer_id, client_id, url, scheduled_at, note) values (me, p_client, p_url, p_when, note) returning id into cid;
  insert into messages (trainer_id, client_id, sender_id, kind, body, call_id)
    values (me, p_client, me, 'call_invite', 'Videollamada programada para ' || to_char(p_when at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI') || ' (hora Colombia)', cid);
  insert into notifications (user_id, kind, title, body, link, dedupe_key)
    values (p_client, 'call', 'Videollamada programada', to_char(p_when at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI') || ' (hora Colombia)', '/client/messages', 'call:' || cid::text);
  return cid;
end $$;

create function cancel_call(p_call uuid) returns void language plpgsql security definer set search_path = public as $$
declare v video_calls;
begin
  select * into v from video_calls where id = p_call and trainer_id = auth.uid();
  if not found then raise exception 'forbidden'; end if;
  update video_calls set status = 'canceled' where id = p_call;
  insert into notifications (user_id, kind, title, body, link, dedupe_key)
    values (v.client_id, 'call', 'Videollamada cancelada', null, '/client/messages', 'callx:' || p_call::text) on conflict do nothing;
end $$;

-- Marks the other party's messages as read. Returns how many changed.
create function mark_conversation_read(p_peer uuid) returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update messages set read_at = now()
   where read_at is null and sender_id = p_peer and auth.uid() in (trainer_id, client_id) and sender_id <> auth.uid()
     and (client_id = auth.uid() or can_message(trainer_id, client_id));
  get diagnostics n = row_count; return n;
end $$;

revoke all on function send_message(uuid, text), schedule_call(uuid, text, timestamptz, text), cancel_call(uuid), mark_conversation_read(uuid) from public, anon;
grant execute on function send_message(uuid, text), schedule_call(uuid, text, timestamptz, text), cancel_call(uuid), mark_conversation_read(uuid) to authenticated;

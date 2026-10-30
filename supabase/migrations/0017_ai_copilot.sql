-- Limits are data, not code, and are only writable by the service role (callers can never pass their own limits).
create table ai_limits (
  role user_role primary key,
  per_minute int not null check (per_minute > 0),
  per_day int not null check (per_day > 0),
  monthly_tokens bigint not null check (monthly_tokens > 0)
);
insert into ai_limits values ('trainer', 5, 60, 2000000), ('client', 3, 20, 300000);
alter table ai_limits enable row level security;
create policy ai_limits_read on ai_limits for select to authenticated using (true);

create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  status text not null default 'reserved' check (status in ('reserved','ok','error','blocked')),
  provider text, model text,
  input_tokens int not null default 0, output_tokens int not null default 0, latency_ms int,
  created_at timestamptz not null default now()
);
create index on ai_usage (user_id, created_at desc);
alter table ai_usage enable row level security;
create policy ai_usage_own on ai_usage for select using (user_id = auth.uid());

create table ai_interactions (
  id uuid primary key default gen_random_uuid(),
  usage_id uuid not null references ai_usage(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  client_id uuid references profiles(id) on delete cascade,
  kind text not null,
  input_digest text not null,                 -- hash of the redacted context actually sent: no raw prompt is stored
  output jsonb,                               -- validated output only
  violations jsonb not null default '[]',     -- deterministic validator findings
  flags text[] not null default '{}',         -- e.g. injection_suspected
  status text not null check (status in ('ok','rejected','error')),
  created_at timestamptz not null default now()
);
create index on ai_interactions (user_id, created_at desc);
alter table ai_interactions enable row level security;
create policy ai_inter_own on ai_interactions for select using (user_id = auth.uid());
-- no insert/update/delete policies: written only through ai_finish()

-- Atomically checks the caller's limits, the client's consent and access, and reserves a usage slot.
create function ai_reserve(p_kind text, p_client uuid default null, p_sensitive boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r user_role; lim ai_limits; n_min int; n_day int; tokens bigint; uid_usage uuid;
begin
  if uid is null then return jsonb_build_object('allowed', false, 'reason', 'unauthenticated'); end if;
  select role into r from profiles where id = uid;
  if r is null then return jsonb_build_object('allowed', false, 'reason', 'unknown_user'); end if;
  perform pg_advisory_xact_lock(hashtext('ai:' || uid::text));        -- serialises concurrent requests of one user
  select * into lim from ai_limits where role = r;
  if p_client is not null then
    if r = 'trainer' and not can_access_client(p_client) then return jsonb_build_object('allowed', false, 'reason', 'no_access'); end if;
    if r = 'client' and p_client <> uid then return jsonb_build_object('allowed', false, 'reason', 'no_access'); end if;
  end if;
  if p_sensitive then
    if p_client is null then return jsonb_build_object('allowed', false, 'reason', 'no_access'); end if;
    if not has_consent(p_client, 'ai_processing') then return jsonb_build_object('allowed', false, 'reason', 'no_consent'); end if;
  end if;
  select count(*) into n_min from ai_usage where user_id = uid and created_at > now() - interval '1 minute' and status <> 'blocked';
  select count(*) into n_day from ai_usage where user_id = uid and created_at > now() - interval '24 hours' and status <> 'blocked';
  select coalesce(sum(input_tokens + output_tokens), 0) into tokens from ai_usage where user_id = uid and created_at >= date_trunc('month', now());
  if n_min >= lim.per_minute then insert into ai_usage (user_id, kind, status) values (uid, p_kind, 'blocked'); return jsonb_build_object('allowed', false, 'reason', 'rate_limit_minute'); end if;
  if n_day >= lim.per_day then insert into ai_usage (user_id, kind, status) values (uid, p_kind, 'blocked'); return jsonb_build_object('allowed', false, 'reason', 'rate_limit_day'); end if;
  if tokens >= lim.monthly_tokens then insert into ai_usage (user_id, kind, status) values (uid, p_kind, 'blocked'); return jsonb_build_object('allowed', false, 'reason', 'budget_month'); end if;
  insert into ai_usage (user_id, kind) values (uid, p_kind) returning id into uid_usage;
  return jsonb_build_object('allowed', true, 'usage_id', uid_usage, 'remaining_day', lim.per_day - n_day - 1);
end $$;

create function ai_finish(p_usage uuid, p_status text, p_provider text, p_model text, p_in int, p_out int, p_ms int, p_client uuid, p_digest text, p_output jsonb, p_violations jsonb, p_flags text[], p_inter_status text)
returns void language plpgsql security definer set search_path = public as $$
declare u ai_usage;
begin
  select * into u from ai_usage where id = p_usage and user_id = auth.uid() and status = 'reserved' for update;
  if u.id is null then raise exception 'unknown usage'; end if;
  update ai_usage set status = p_status, provider = p_provider, model = p_model, input_tokens = greatest(0, coalesce(p_in, 0)), output_tokens = greatest(0, coalesce(p_out, 0)), latency_ms = p_ms where id = u.id;
  insert into ai_interactions (usage_id, user_id, client_id, kind, input_digest, output, violations, flags, status)
    values (u.id, u.user_id, p_client, u.kind, p_digest, p_output, coalesce(p_violations, '[]'), coalesce(p_flags, '{}'), p_inter_status);
end $$;

revoke execute on function ai_reserve(text, uuid, boolean), ai_finish(uuid, text, text, text, int, int, int, uuid, text, jsonb, jsonb, text[], text) from public, anon;
grant execute on function ai_reserve(text, uuid, boolean), ai_finish(uuid, text, text, text, int, int, int, uuid, text, jsonb, jsonb, text[], text) to authenticated;

-- trainer closure also removes their AI interactions (they contain derived client information)
create or replace function close_trainer_account(p_trainer uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare role_ user_role;
begin
  select role into role_ from profiles where id = p_trainer;
  if role_ is distinct from 'trainer' then raise exception 'not a trainer account'; end if;
  update trainer_client_relationships set status = 'archived' where trainer_id = p_trainer;
  update training_plans set archived_at = now() where trainer_id = p_trainer and archived_at is null;
  delete from recommendation_decisions where decided_by = p_trainer or recommendation_id in (select id from coach_recommendations where trainer_id = p_trainer);
  delete from coach_recommendations where trainer_id = p_trainer;
  delete from ai_interactions where user_id = p_trainer;
  delete from invitations where trainer_id = p_trainer and status = 'pending';
  delete from notifications where user_id = p_trainer;
  delete from consents where user_id = p_trainer;
  delete from photo_schedules where trainer_id = p_trainer;
  update trainer_subscriptions set status = 'expired', current_period_end = now(), updated_at = now() where trainer_id = p_trainer;
  update profiles set full_name = 'Cuenta cerrada' where id = p_trainer;
  insert into erasure_log (subject_hash, role, kind) values (encode(sha256(convert_to(p_trainer::text, 'UTF8')), 'hex'), 'trainer', 'trainer_closure');
  return jsonb_build_object('closed', true);
end $$;

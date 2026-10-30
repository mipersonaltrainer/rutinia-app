-- AI credits. A draft (diet or training plan) costs one credit. Each trainer gets 3 free drafts a month; more come in prepaid packs
-- (25 for USD 7.00, 100 for USD 20.00). Everything else the AI does (progress-report text, the client's assistant) is not billed but capped.
--   * The balance is derived from records, never stored: purchases that are approved minus the drafts that spent a credit.
--   * A credit is spent when the draft is reserved and given back when it fails, is rejected by the validator or is abandoned (10 minutes).
--   * Money moves the same way as slot purchases: only the service role settles a purchase, from a payment verified with the provider.

-- ===== which credit each usage spent ========================================================================================================
alter table ai_usage add column credit_source text check (credit_source in ('free', 'paid'));
create index ai_usage_credit on ai_usage (user_id, credit_source, created_at) where credit_source is not null;

-- ===== purchases ===========================================================================================================================
create table ai_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references profiles(id),
  provider payment_provider not null,
  provider_reference text not null,
  pack text not null check (pack in ('p25', 'p100')),
  credits int not null,
  total_cents int not null,
  currency text not null default 'USD',
  charged_amount_cents bigint,
  charged_currency text,
  fx_rate numeric, fx_rate_at timestamptz,
  status payment_status not null default 'pending',
  credits_granted boolean not null default false,
  provider_txn_id text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference),
  check ((pack = 'p25' and credits = 25 and total_cents = 700) or (pack = 'p100' and credits = 100 and total_cents = 2000))
);
create unique index ai_credit_purchases_txn on ai_credit_purchases (provider, provider_txn_id) where provider_txn_id is not null;
create index on ai_credit_purchases (trainer_id, created_at desc);
alter table ai_credit_purchases enable row level security;
create policy acp_owner on ai_credit_purchases for select to authenticated using (trainer_id = auth.uid());
revoke insert, update, delete, truncate on ai_credit_purchases from anon, authenticated;     -- written by the service role only

-- ===== balance =============================================================================================================================
-- Internal: the state of one trainer. A usage counts while it finished well, or while it is still being served (up to 10 minutes).
create function ai_credit_state(p_trainer uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'free_monthly', 3,
    'free_left', greatest(0, 3 - (select count(*) from ai_usage u where u.user_id = p_trainer and u.credit_source = 'free' and u.created_at >= date_trunc('month', now())
                                   and (u.status = 'ok' or (u.status = 'reserved' and u.created_at > now() - interval '10 minutes')))),
    'paid_left', greatest(0, coalesce((select sum(p.credits) from ai_credit_purchases p where p.trainer_id = p_trainer and p.status = 'approved'), 0)
                           - (select count(*) from ai_usage u where u.user_id = p_trainer and u.credit_source = 'paid'
                                and (u.status = 'ok' or (u.status = 'reserved' and u.created_at > now() - interval '10 minutes')))));
$$;
revoke execute on function ai_credit_state(uuid) from public, anon, authenticated;
grant execute on function ai_credit_state(uuid) to service_role;

-- What a trainer sees about their own balance (null for anyone who is not a trainer).
create function my_ai_credits() returns jsonb language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from profiles where id = auth.uid() and role = 'trainer') then ai_credit_state(auth.uid()) end;
$$;
revoke execute on function my_ai_credits() from public, anon;
grant execute on function my_ai_credits() to authenticated;

-- ===== reserve: the credit is taken here, atomically with the rate limits ===================================================================
create or replace function ai_reserve(p_kind text, p_client uuid default null, p_sensitive boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r user_role; lim ai_limits; n_min int; n_day int; tokens bigint; uid_usage uuid; billable boolean; src text; cr jsonb; left_after int;
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

  billable := r = 'trainer' and p_kind in ('diet_draft', 'plan_draft');
  if billable then
    cr := ai_credit_state(uid);
    if (cr->>'free_left')::int > 0 then src := 'free';
    elsif (cr->>'paid_left')::int > 0 then src := 'paid';
    else return jsonb_build_object('allowed', false, 'reason', 'no_credits'); end if;       -- nothing is recorded: a refusal costs nothing and does not count towards the limits
    left_after := (cr->>'free_left')::int + (cr->>'paid_left')::int - 1;
  elsif tokens >= lim.monthly_tokens then
    insert into ai_usage (user_id, kind, status) values (uid, p_kind, 'blocked'); return jsonb_build_object('allowed', false, 'reason', 'budget_month');   -- drafts are bounded by what was paid for instead
  end if;

  insert into ai_usage (user_id, kind, credit_source) values (uid, p_kind, src) returning id into uid_usage;
  return jsonb_build_object('allowed', true, 'usage_id', uid_usage, 'remaining_day', lim.per_day - n_day - 1, 'credits_left', left_after);
end $$;

-- ===== finish: a draft that did not produce a usable result gives its credit back ==========================================================
create or replace function ai_finish(p_usage uuid, p_status text, p_provider text, p_model text, p_in int, p_out int, p_ms int, p_client uuid, p_digest text, p_output jsonb, p_violations jsonb, p_flags text[], p_inter_status text)
returns uuid language plpgsql security definer set search_path = public as $$
declare u ai_usage; iid uuid;
begin
  if p_status not in ('ok', 'error') or p_inter_status not in ('ok', 'rejected', 'error') then raise exception 'invalid status'; end if;
  if p_client is not null and not can_access_client(p_client) then raise exception 'no access to that client'; end if;
  select * into u from ai_usage where id = p_usage and user_id = auth.uid() and status = 'reserved' for update;
  if u.id is null then raise exception 'unknown usage'; end if;
  update ai_usage set status = p_status, provider = p_provider, model = p_model, input_tokens = greatest(0, coalesce(p_in, 0)), output_tokens = greatest(0, coalesce(p_out, 0)), latency_ms = p_ms,
    credit_source = case when p_status = 'ok' and p_inter_status = 'ok' then credit_source else null end where id = u.id;
  insert into ai_interactions (usage_id, user_id, client_id, kind, input_digest, output, violations, flags, status)
    values (u.id, u.user_id, p_client, u.kind, p_digest, p_output, coalesce(p_violations, '[]'), coalesce(p_flags, '{}'), p_inter_status) returning id into iid;
  return iid;
end $$;

-- ===== settling a purchase (same rules as slot purchases) ===================================================================================
create function settle_ai_credit_purchase(p_provider payment_provider, p_reference text, p_txn_id text, p_status payment_status, p_amount bigint, p_currency text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r ai_credit_purchases; granted boolean := false; was payment_status;
begin
  select * into r from ai_credit_purchases where provider = p_provider and provider_reference = p_reference for update;
  if r.id is null then return jsonb_build_object('result', 'unknown_reference'); end if;
  if p_status = 'approved' and (r.charged_amount_cents is distinct from p_amount or r.charged_currency is distinct from p_currency) then
    insert into billing_audit_events (trainer_id, kind, detail) values (r.trainer_id, 'ai_credits_amount_mismatch', jsonb_build_object('reference', p_reference, 'expected', r.charged_amount_cents, 'got', p_amount, 'currency', p_currency));
    return jsonb_build_object('result', 'amount_mismatch');
  end if;
  if not payment_transition_ok(r.status, p_status) then return jsonb_build_object('result', 'noop', 'status', r.status); end if;
  was := r.status;
  update ai_credit_purchases set status = p_status, provider_txn_id = coalesce(p_txn_id, provider_txn_id), updated_at = now(),
    verified_at = case when p_status = 'approved' then now() else verified_at end,
    credits_granted = case when p_status = 'approved' then true else credits_granted end where id = r.id;
  granted := p_status = 'approved' and not r.credits_granted;
  insert into billing_audit_events (trainer_id, kind, detail) values (r.trainer_id, 'ai_credits_' || p_status, jsonb_build_object('reference', p_reference, 'from', was, 'pack', r.pack, 'credits', r.credits, 'granted', granted));
  return jsonb_build_object('result', 'updated', 'status', p_status, 'granted', granted, 'trainer_id', r.trainer_id);
end $$;
revoke execute on function settle_ai_credit_purchase(payment_provider, text, text, payment_status, bigint, text) from public, anon, authenticated;
grant execute on function settle_ai_credit_purchase(payment_provider, text, text, payment_status, bigint, text) to service_role;

-- Pending purchases that were never paid expire after a day, like the others.
create or replace function expire_subscriptions() returns jsonb language plpgsql security definer set search_path = public as $$
declare a int; b int; c int; d int;
begin
  update trainer_subscriptions set status = 'payment_required', updated_at = now() where status = 'trialing' and trial_ends_at <= now(); get diagnostics a = row_count;
  update trainer_subscriptions set status = 'payment_required', updated_at = now() where status in ('active','past_due') and current_period_end is not null and current_period_end <= now(); get diagnostics b = row_count;
  update trainer_subscriptions set status = 'expired', updated_at = now() where status = 'canceled' and current_period_end is not null and current_period_end <= now(); get diagnostics c = row_count;
  update slot_purchases set status = 'expired', updated_at = now() where status = 'pending' and created_at < now() - interval '24 hours'; get diagnostics d = row_count;
  update ai_credit_purchases set status = 'expired', updated_at = now() where status = 'pending' and created_at < now() - interval '24 hours';
  update subscription_payments set status = 'expired' where status = 'pending' and created_at < now() - interval '24 hours';
  return jsonb_build_object('trials_expired', a, 'periods_lapsed', b, 'canceled_expired', c, 'pending_purchases_expired', d);
end $$;

-- ===== the client's assistant is paid by the platform, so its cap is lower ==================================================================
update ai_limits set per_day = 10, monthly_tokens = 200000 where role = 'client';

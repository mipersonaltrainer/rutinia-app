-- Access rule (server-side, also enforced by RLS everywhere through trainer_has_access):
--   trialing  : until trial_ends_at
--   active / past_due / canceled : until current_period_end (what was already paid is honoured, no extra grace)
--   everything else: no access
create or replace function trainer_has_access(t uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from trainer_subscriptions s where s.trainer_id = t and (
    (s.status = 'trialing' and s.trial_ends_at > now())
    or (s.status in ('active','past_due','canceled') and s.current_period_end is not null and s.current_period_end > now())));
$$;

create table fx_rates (
  id uuid primary key default gen_random_uuid(),
  base text not null default 'USD', quote text not null default 'COP',
  rate numeric(14,4) not null check (rate > 0),
  source text not null check (length(source) >= 3),
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on fx_rates (base, quote, effective_at desc);
alter table fx_rates enable row level security;
create policy fx_read on fx_rates for select to authenticated using (true);   -- written only by the service role (admin script)

alter table slot_purchases add column provider_txn_id text, add column verified_at timestamptz, add column updated_at timestamptz not null default now();
create unique index slot_purchases_txn on slot_purchases (provider, provider_txn_id) where provider_txn_id is not null;

create table subscription_payments (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references profiles(id),
  provider payment_provider not null,
  provider_reference text not null,            -- our reference (wompi) or provider transaction id (paypal recurring)
  provider_txn_id text,
  amount_usd_cents int not null check (amount_usd_cents = 1000),
  charged_amount_cents bigint not null,
  charged_currency text not null,
  fx_rate numeric(14,4), fx_rate_at timestamptz,
  status payment_status not null default 'pending',
  period_start timestamptz, period_end timestamptz,
  snapshot jsonb,                              -- immutable billing snapshot written when the payment is approved
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (provider, provider_reference)
);
create unique index subscription_payments_txn on subscription_payments (provider, provider_txn_id) where provider_txn_id is not null;
create index on subscription_payments (trainer_id, created_at desc);
alter table subscription_payments enable row level security;
create policy sp_owner on subscription_payments for select to authenticated using (trainer_id = auth.uid());
alter table billing_audit_events enable row level security;
create policy audit_owner on billing_audit_events for select to authenticated using (trainer_id = auth.uid());

-- helper: may a payment move from one status to another? Provider-verified money always wins over our own 'expired' label.
create function payment_transition_ok(cur payment_status, nxt payment_status) returns boolean language sql immutable as $$
  select case
    when cur = nxt then false
    when cur = 'pending' then true
    when cur = 'expired' then nxt = 'approved'
    when cur = 'approved' then nxt = 'voided'
    else false end;
$$;

create function settle_slot_purchase(p_provider payment_provider, p_reference text, p_txn_id text, p_status payment_status, p_amount bigint, p_currency text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r slot_purchases; granted boolean := false; was payment_status;
begin
  select * into r from slot_purchases where provider = p_provider and provider_reference = p_reference for update;
  if r.id is null then return jsonb_build_object('result','unknown_reference'); end if;
  if p_status = 'approved' and (r.charged_amount_cents is distinct from p_amount or r.charged_currency is distinct from p_currency) then
    insert into billing_audit_events (trainer_id, kind, detail) values (r.trainer_id, 'slot_amount_mismatch', jsonb_build_object('reference', p_reference, 'expected', r.charged_amount_cents, 'got', p_amount, 'currency', p_currency));
    return jsonb_build_object('result','amount_mismatch');
  end if;
  if not payment_transition_ok(r.status, p_status) then return jsonb_build_object('result','noop','status',r.status); end if;
  was := r.status;
  update slot_purchases set status = p_status, provider_txn_id = coalesce(p_txn_id, provider_txn_id), updated_at = now(),
    verified_at = case when p_status = 'approved' then now() else verified_at end,
    slots_granted = case when p_status = 'approved' then true else slots_granted end where id = r.id;
  granted := p_status = 'approved' and not r.slots_granted;
  insert into billing_audit_events (trainer_id, kind, detail) values (r.trainer_id, 'slot_purchase_' || p_status, jsonb_build_object('reference', p_reference, 'from', was, 'quantity', r.quantity, 'granted', granted));
  return jsonb_build_object('result','updated','status',p_status,'granted',granted,'trainer_id',r.trainer_id);
end $$;

-- Subscription payments: period is extended once per approved payment (idempotent by unique reference).
create function settle_subscription_payment(p_provider payment_provider, p_reference text, p_txn_id text, p_status payment_status, p_amount bigint, p_currency text, p_trainer uuid default null, p_usd_expected boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r subscription_payments; sub trainer_subscriptions; new_start timestamptz; new_end timestamptz; active_n int; slots int;
begin
  select * into r from subscription_payments where provider = p_provider and provider_reference = p_reference for update;
  if r.id is null then
    if p_trainer is null then return jsonb_build_object('result','unknown_reference'); end if;
    -- provider-originated recurring payment (PayPal): must be exactly USD 10.00
    if p_amount <> 1000 or p_currency <> 'USD' then
      insert into billing_audit_events (trainer_id, kind, detail) values (p_trainer, 'subscription_amount_mismatch', jsonb_build_object('reference', p_reference, 'got', p_amount, 'currency', p_currency));
      return jsonb_build_object('result','amount_mismatch');
    end if;
    insert into subscription_payments (trainer_id, provider, provider_reference, provider_txn_id, amount_usd_cents, charged_amount_cents, charged_currency, status)
      values (p_trainer, p_provider, p_reference, p_txn_id, 1000, p_amount, p_currency, 'pending') returning * into r;
  end if;
  if p_status = 'approved' and (r.charged_amount_cents is distinct from p_amount or r.charged_currency is distinct from p_currency) then
    insert into billing_audit_events (trainer_id, kind, detail) values (r.trainer_id, 'subscription_amount_mismatch', jsonb_build_object('reference', p_reference, 'expected', r.charged_amount_cents, 'got', p_amount));
    return jsonb_build_object('result','amount_mismatch');
  end if;
  if not payment_transition_ok(r.status, p_status) then return jsonb_build_object('result','noop','status',r.status); end if;

  if p_status = 'approved' then
    select * into sub from trainer_subscriptions where trainer_id = r.trainer_id for update;
    new_start := greatest(coalesce(sub.current_period_end, now()), now());       -- early renewals stack, late ones start now
    new_end := new_start + interval '1 month';
    select count(*) into active_n from trainer_client_relationships where trainer_id = r.trainer_id and status = 'active';
    slots := trainer_capacity(r.trainer_id) - 20;
    update subscription_payments set status = 'approved', provider_txn_id = coalesce(p_txn_id, provider_txn_id), verified_at = now(), period_start = new_start, period_end = new_end,
      snapshot = jsonb_build_object('base_usd_cents', 1000, 'included_clients', 20, 'active_clients', active_n, 'additional_slots', slots, 'currency', r.charged_currency, 'charged_amount_cents', r.charged_amount_cents, 'fx_rate', r.fx_rate, 'fx_rate_at', r.fx_rate_at, 'provider', r.provider)
      where id = r.id;
    update trainer_subscriptions set status = 'active', provider = p_provider, current_period_end = new_end, updated_at = now() where trainer_id = r.trainer_id;
    insert into billing_audit_events (trainer_id, kind, detail) values (r.trainer_id, 'subscription_payment_approved', jsonb_build_object('reference', p_reference, 'period_end', new_end));
    return jsonb_build_object('result','updated','status','approved','trainer_id',r.trainer_id,'period_end',new_end);
  end if;

  update subscription_payments set status = p_status, provider_txn_id = coalesce(p_txn_id, provider_txn_id) where id = r.id;
  if p_status = 'voided' then
    insert into billing_audit_events (trainer_id, kind, detail) values (r.trainer_id, 'subscription_payment_voided', jsonb_build_object('reference', p_reference));
  end if;
  return jsonb_build_object('result','updated','status',p_status,'trainer_id',r.trainer_id);
end $$;

-- Provider-confirmed subscription state (PayPal). A state alone never grants paid time: only settled payments do.
create function apply_provider_subscription_state(p_trainer uuid, p_provider payment_provider, p_provider_sub_id text, p_state text, p_failed_count int default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare sub trainer_subscriptions; nxt subscription_status;
begin
  select * into sub from trainer_subscriptions where trainer_id = p_trainer for update;
  if sub.trainer_id is null then return jsonb_build_object('result','unknown_trainer'); end if;
  update trainer_subscriptions set provider = p_provider, provider_subscription_id = p_provider_sub_id, updated_at = now() where trainer_id = p_trainer;
  nxt := case
    when p_state = 'CANCELLED' then 'canceled'
    when p_state = 'EXPIRED' then 'expired'
    when p_state = 'SUSPENDED' then 'suspended'
    when p_state = 'ACTIVE' and p_failed_count > 0 and sub.status = 'active' then 'past_due'
    when p_state = 'ACTIVE' and sub.status in ('past_due','suspended','canceled','expired','payment_required') and p_failed_count = 0 and sub.current_period_end is not null and sub.current_period_end > now() then 'active'
    else sub.status end;
  if nxt is distinct from sub.status then
    update trainer_subscriptions set status = nxt, updated_at = now() where trainer_id = p_trainer;
    insert into billing_audit_events (trainer_id, kind, detail) values (p_trainer, 'subscription_state', jsonb_build_object('from', sub.status, 'to', nxt, 'provider_state', p_state));
  end if;
  return jsonb_build_object('result','updated','status',nxt);
end $$;

-- Scheduled enforcement (not dependent on the trainer opening the app).
create function expire_subscriptions() returns jsonb language plpgsql security definer set search_path = public as $$
declare a int; b int; c int; d int;
begin
  update trainer_subscriptions set status = 'payment_required', updated_at = now() where status = 'trialing' and trial_ends_at <= now(); get diagnostics a = row_count;
  update trainer_subscriptions set status = 'payment_required', updated_at = now() where status in ('active','past_due') and current_period_end is not null and current_period_end <= now(); get diagnostics b = row_count;
  update trainer_subscriptions set status = 'expired', updated_at = now() where status = 'canceled' and current_period_end is not null and current_period_end <= now(); get diagnostics c = row_count;
  update slot_purchases set status = 'expired', updated_at = now() where status = 'pending' and created_at < now() - interval '24 hours'; get diagnostics d = row_count;
  update subscription_payments set status = 'expired' where status = 'pending' and created_at < now() - interval '24 hours';
  return jsonb_build_object('trials_expired', a, 'periods_lapsed', b, 'canceled_expired', c, 'pending_purchases_expired', d);
end $$;

revoke execute on function settle_slot_purchase(payment_provider,text,text,payment_status,bigint,text), settle_subscription_payment(payment_provider,text,text,payment_status,bigint,text,uuid,boolean),
  apply_provider_subscription_state(uuid,payment_provider,text,text,int), expire_subscriptions() from public, anon, authenticated;
grant execute on function settle_slot_purchase(payment_provider,text,text,payment_status,bigint,text), settle_subscription_payment(payment_provider,text,text,payment_status,bigint,text,uuid,boolean),
  apply_provider_subscription_state(uuid,payment_provider,text,text,int), expire_subscriptions() to service_role;

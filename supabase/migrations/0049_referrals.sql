-- Referral codes. A trainer gets one unique code to share; whoever signs up with it gets a 10-day trial instead of 7, and when that person makes their
-- first approved subscription payment the referrer gets the reward THEY chose: extra client slots, AI drafts or extra days. Nothing here is written by the
-- browser roles: reads go through RLS, writes through the SECURITY DEFINER functions below.

create table referral_codes (
  trainer_id uuid primary key references profiles(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z2-9]{7}$'),
  reward text not null default 'slots' check (reward in ('slots', 'ai', 'days')),
  created_at timestamptz not null default now()
);
create table referrals (
  referred_id uuid primary key references profiles(id) on delete cascade,
  referrer_id uuid not null references profiles(id) on delete cascade check (referrer_id <> referred_id),
  code text not null,
  status text not null default 'pending' check (status in ('pending', 'rewarded', 'capped')),
  reward text check (reward in ('slots', 'ai', 'days')),
  amount int check (amount > 0),
  created_at timestamptz not null default now(),
  rewarded_at timestamptz
);
create index on referrals (referrer_id, status);
alter table referral_codes enable row level security;
alter table referrals enable row level security;
create policy referral_codes_owner on referral_codes for select to authenticated using (trainer_id = auth.uid());
create policy referrals_referrer on referrals for select to authenticated using (referrer_id = auth.uid());
revoke all on referral_codes, referrals from anon, authenticated;
grant select on referral_codes, referrals to authenticated;

-- What a referral is worth, and how many can be rewarded per trainer (a cap so a code cannot become a business).
create function referral_terms() returns jsonb language sql immutable as $$
  select jsonb_build_object('trial_days', 10, 'slots', 3, 'ai', 10, 'days', 7, 'cap', 10);
$$;
revoke execute on function referral_terms() from public, anon;
grant execute on function referral_terms() to authenticated, service_role;

-- Internal: attach a new account to a code. Returns true if it was applied. Never raises: signing up must not fail because of a code.
create function apply_referral(p_user uuid, p_code text) returns boolean language plpgsql security definer set search_path = public as $$
declare owner uuid; c text := upper(btrim(coalesce(p_code, '')));
begin
  if c !~ '^[A-Z2-9]{7}$' then return false; end if;
  select trainer_id into owner from referral_codes where code = c;
  if owner is null or owner = p_user then return false; end if;
  if exists (select 1 from referrals where referred_id = p_user) then return false; end if;
  insert into referrals (referred_id, referrer_id, code) values (p_user, owner, c);
  update trainer_subscriptions set trial_ends_at = trial_started_at + make_interval(days => (referral_terms()->>'trial_days')::int)
    where trainer_id = p_user and status = 'trialing';
  return true;
exception when others then return false;
end $$;
revoke execute on function apply_referral(uuid, text) from public, anon, authenticated;

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare r user_role := coalesce((new.raw_app_meta_data->>'role')::user_role, 'trainer'); bd date;
begin
  begin bd := nullif(new.raw_user_meta_data->>'birth_date', '')::date; exception when others then bd := null; end;
  if bd is not null and (bd > current_date - interval '16 years' or bd < date '1900-01-01') then bd := null; end if;
  insert into profiles (id, role, full_name, birth_date)
    values (new.id, r, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), case when r = 'trainer' then bd else null end);
  if r = 'trainer' then
    insert into trainer_subscriptions (trainer_id) values (new.id);  -- 7-day trial from server clock
    perform apply_referral(new.id, new.raw_user_meta_data->>'ref_code');   -- 10 days when it carries a valid code
  end if;
  return new;
end $$;

-- A trainer who came in another way (Google, or forgot) can enter a code during their first 3 days, while still on the trial and before paying.
create function redeem_referral_code(p_code text) returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s trainer_subscriptions;
begin
  if uid is null then return false; end if;
  select * into s from trainer_subscriptions where trainer_id = uid;
  if s.trainer_id is null or s.status <> 'trialing' or s.trial_started_at < now() - interval '3 days' then return false; end if;
  if exists (select 1 from subscription_payments where trainer_id = uid) then return false; end if;
  return apply_referral(uid, p_code);
end $$;
revoke execute on function redeem_referral_code(text) from public, anon;
grant execute on function redeem_referral_code(text) to authenticated;

-- The trainer's own code (created on first use) and the reward they want. Returns the code.
create function set_my_referral(p_reward text) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text; i int := 0; alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if uid is null or not exists (select 1 from profiles where id = uid and role = 'trainer') then raise exception 'not a trainer'; end if;
  if p_reward not in ('slots', 'ai', 'days') then raise exception 'bad reward'; end if;
  select code into c from referral_codes where trainer_id = uid;
  if c is not null then update referral_codes set reward = p_reward where trainer_id = uid; return c; end if;
  loop
    c := (select string_agg(substr(alphabet, 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 7));
    begin
      insert into referral_codes (trainer_id, code, reward) values (uid, c, p_reward);
      return c;
    exception when unique_violation then
      i := i + 1; if i > 10 then raise exception 'could not allocate a code'; end if;
    end;
  end loop;
end $$;
revoke execute on function set_my_referral(text) from public, anon;
grant execute on function set_my_referral(text) to authenticated;

-- Internal: called when a payment is approved. Pays the referrer once, for the referred's first approved payment.
create function grant_referral_reward(p_referred uuid) returns void language plpgsql security definer set search_path = public as $$
declare rf referrals; want text; got text; n int; terms jsonb := referral_terms(); sub trainer_subscriptions;
begin
  select * into rf from referrals where referred_id = p_referred and status = 'pending' for update;
  if rf.referred_id is null then return; end if;
  perform pg_advisory_xact_lock(hashtext('ref:' || rf.referrer_id::text));
  if (select count(*) from referrals where referrer_id = rf.referrer_id and status = 'rewarded') >= (terms->>'cap')::int then
    update referrals set status = 'capped' where referred_id = p_referred; return;
  end if;
  select reward into want from referral_codes where trainer_id = rf.referrer_id;
  got := coalesce(want, 'slots'); n := (terms->>got)::int;
  if got = 'days' then
    select * into sub from trainer_subscriptions where trainer_id = rf.referrer_id for update;
    if sub.status = 'trialing' then update trainer_subscriptions set trial_ends_at = trial_ends_at + make_interval(days => n) where trainer_id = rf.referrer_id;
    elsif sub.status in ('active', 'past_due', 'canceled') and sub.current_period_end is not null then update trainer_subscriptions set current_period_end = current_period_end + make_interval(days => n) where trainer_id = rf.referrer_id;
    else got := 'slots'; n := (terms->>'slots')::int; end if;        -- days cannot be applied to an expired plan: give slots instead
  end if;
  update referrals set status = 'rewarded', reward = got, amount = n, rewarded_at = now() where referred_id = p_referred;
  insert into billing_audit_events (trainer_id, kind, detail) values (rf.referrer_id, 'referral_rewarded', jsonb_build_object('referred', p_referred, 'reward', got, 'amount', n));
end $$;
revoke execute on function grant_referral_reward(uuid) from public, anon, authenticated;

-- The reward counts: slots raise the capacity, AI drafts add to the paid balance.
create or replace function trainer_capacity(t uuid) returns integer language sql stable security definer set search_path = public as $$
  select case when related_to_caller(t) then 20
      + coalesce((select sum(quantity) from slot_purchases where trainer_id = t and status = 'approved' and slots_granted), 0)::int
      + coalesce((select sum(amount) from referrals where referrer_id = t and status = 'rewarded' and reward = 'slots'), 0)::int
    else 0 end;
$$;
create or replace function ai_credit_state(p_trainer uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'free_monthly', 3,
    'free_left', greatest(0, 3 - (select count(*) from ai_usage u where u.user_id = p_trainer and u.credit_source = 'free' and u.created_at >= date_trunc('month', now())
                                   and (u.status = 'ok' or (u.status = 'reserved' and u.created_at > now() - interval '10 minutes')))),
    'paid_left', greatest(0, coalesce((select sum(p.credits) from ai_credit_purchases p where p.trainer_id = p_trainer and p.status = 'approved'), 0)
                           + coalesce((select sum(r.amount) from referrals r where r.referrer_id = p_trainer and r.status = 'rewarded' and r.reward = 'ai'), 0)
                           - (select count(*) from ai_usage u where u.user_id = p_trainer and u.credit_source = 'paid'
                                and (u.status = 'ok' or (u.status = 'reserved' and u.created_at > now() - interval '10 minutes')))));
$$;

-- ===== reward on the referred's first approved payment (same function as 0033 plus the one hook) =====
create or replace function settle_subscription_payment(p_provider payment_provider, p_reference text, p_txn_id text, p_status payment_status, p_amount bigint, p_currency text, p_trainer uuid DEFAULT NULL::uuid, p_usd_expected boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      snapshot = jsonb_build_object('base_usd_cents', r.amount_usd_cents, 'base_price_cents', r.charged_amount_cents, 'included_clients', 20, 'active_clients', active_n, 'additional_slots', slots, 'currency', r.charged_currency, 'charged_amount_cents', r.charged_amount_cents, 'fx_rate', r.fx_rate, 'fx_rate_at', r.fx_rate_at, 'provider', r.provider)
      where id = r.id;
    update trainer_subscriptions set status = 'active', provider = p_provider, current_period_end = new_end, updated_at = now() where trainer_id = r.trainer_id;
    insert into billing_audit_events (trainer_id, kind, detail) values (r.trainer_id, 'subscription_payment_approved', jsonb_build_object('reference', p_reference, 'period_end', new_end));
    begin perform grant_referral_reward(r.trainer_id); exception when others then null; end;      -- a referral problem must never block a payment
    return jsonb_build_object('result','updated','status','approved','trainer_id',r.trainer_id,'period_end',new_end);
  end if;

  update subscription_payments set status = p_status, provider_txn_id = coalesce(p_txn_id, provider_txn_id) where id = r.id;
  if p_status = 'voided' then
    insert into billing_audit_events (trainer_id, kind, detail) values (r.trainer_id, 'subscription_payment_voided', jsonb_build_object('reference', p_reference));
  end if;
  return jsonb_build_object('result','updated','status',p_status,'trainer_id',r.trainer_id);
end $function$;
revoke execute on function settle_subscription_payment(payment_provider, text, text, payment_status, bigint, text, uuid, boolean) from public, anon, authenticated;
grant execute on function settle_subscription_payment(payment_provider, text, text, payment_status, bigint, text, uuid, boolean) to service_role;

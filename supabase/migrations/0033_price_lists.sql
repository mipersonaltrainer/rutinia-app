-- Two price lists. Wompi (Colombia) charges pesos with fixed prices and no conversion; PayPal charges dollars, as before.
--   Subscription: COP 40.000 a month / USD 10.00.   Extra students: pesos by tier (1-2: 2.500, 3-4: 2.400, 5-9: 2.200, 10: 2.000) / USD 0.75 flat.
--   AI packs: 20 drafts for COP 25.000 / USD 6.00, 100 drafts for COP 100.000 / USD 20.00.
-- Existing rows keep the shape they had (the new rules are added NOT VALID, so only new rows are checked); nothing is rewritten.

-- ===== student slots =======================================================================================================================
create function slot_unit_cop(q int) returns int language sql immutable as $$
  select case when q <= 2 then 250000 when q <= 4 then 240000 when q <= 9 then 220000 else 200000 end;      -- centavos
$$;
alter table slot_purchases drop constraint slot_purchases_unit_price_cents_check;
alter table slot_purchases add constraint slot_purchases_unit_price_by_list check (
  (currency <> 'COP' and unit_price_cents = 75) or (currency = 'COP' and unit_price_cents = slot_unit_cop(quantity))) not valid;

-- ===== subscription ========================================================================================================================
alter table subscription_payments alter column amount_usd_cents drop not null;
alter table subscription_payments drop constraint subscription_payments_amount_usd_cents_check;
alter table subscription_payments add constraint subscription_payments_price_by_list check (
  coalesce(amount_usd_cents = 1000, false) or (amount_usd_cents is null and charged_currency = 'COP' and charged_amount_cents = 4000000)) not valid;     -- coalesce: a NULL check result would pass

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

-- ===== AI packs ============================================================================================================================
alter table ai_credit_purchases drop constraint ai_credit_purchases_check;
alter table ai_credit_purchases drop constraint ai_credit_purchases_pack_check;
alter table ai_credit_purchases add constraint ai_credit_purchases_pack_check check (pack in ('p20', 'p100'));
alter table ai_credit_purchases add constraint ai_credit_purchases_price_by_list check (
  (pack = 'p20' and credits = 20 and ((currency = 'USD' and total_cents = 600) or (currency = 'COP' and total_cents = 2500000)))
  or (pack = 'p100' and credits = 100 and ((currency = 'USD' and total_cents = 2000) or (currency = 'COP' and total_cents = 10000000)))) ;

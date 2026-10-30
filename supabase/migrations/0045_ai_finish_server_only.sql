-- AUD-003. A trainer with a normal session could call ai_reserve + ai_finish by hand and file an "ok" AI record with any provider, model and
-- output, so the audit trail did not prove that a model produced what it says. Now: the reservation remembers the student it was for, and
-- ai_finish — the only way an interaction record is written — runs for the server alone (service role), taking the user and the student from
-- the reservation instead of from the caller. Users can still reserve (that is the quota/consent gate and only spends their own allowance).
alter table ai_usage add column client_id uuid references profiles(id) on delete set null;

create or replace function public.ai_reserve(p_kind text, p_client uuid DEFAULT NULL::uuid, p_sensitive boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  insert into ai_usage (user_id, kind, credit_source, client_id) values (uid, p_kind, src, p_client) returning id into uid_usage;   -- the reservation remembers whose data it was for
  return jsonb_build_object('allowed', true, 'usage_id', uid_usage, 'remaining_day', lim.per_day - n_day - 1, 'credits_left', left_after);
end $function$;


create or replace function ai_finish(p_usage uuid, p_status text, p_provider text, p_model text, p_in int, p_out int, p_ms int, p_client uuid, p_digest text, p_output jsonb, p_violations jsonb, p_flags text[], p_inter_status text)
returns uuid language plpgsql security definer set search_path = public as $$
declare u ai_usage; iid uuid;
begin
  if p_status not in ('ok', 'error') or p_inter_status not in ('ok', 'rejected', 'error') then raise exception 'invalid status'; end if;
  select * into u from ai_usage where id = p_usage and status = 'reserved' for update;      -- single use; the user is whoever made the reservation
  if u.id is null then raise exception 'unknown usage'; end if;
  if p_client is distinct from u.client_id then raise exception 'client does not match the reservation'; end if;
  update ai_usage set status = p_status, provider = p_provider, model = p_model, input_tokens = greatest(0, coalesce(p_in, 0)), output_tokens = greatest(0, coalesce(p_out, 0)), latency_ms = p_ms,
    credit_source = case when p_status = 'ok' and p_inter_status = 'ok' then credit_source else null end where id = u.id;
  insert into ai_interactions (usage_id, user_id, client_id, kind, input_digest, output, violations, flags, status)
    values (u.id, u.user_id, u.client_id, u.kind, p_digest, p_output, coalesce(p_violations, '[]'), coalesce(p_flags, '{}'), p_inter_status) returning id into iid;
  return iid;
end $$;
revoke all on function ai_finish(uuid, text, text, text, int, int, int, uuid, text, jsonb, jsonb, text[], text) from public, anon, authenticated;
grant execute on function ai_finish(uuid, text, text, text, int, int, int, uuid, text, jsonb, jsonb, text[], text) to service_role;

-- AUD-002. These three helpers are called from RLS policies, so every signed-in user must be able to execute them — but until now they also
-- answered for ANY uuid, which made them an oracle: any account could ask whether another user had given health-data consent, whether a
-- trainer's subscription was live, or how many students they may hold. They now answer only about the caller, someone the caller has (or had) a
-- trainer–student relationship with, or — for the team — anyone. Service-role and trigger contexts (auth.uid() is null) are unchanged.
create or replace function related_to_caller(u uuid) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or u = auth.uid() or is_support_staff()
    or exists (select 1 from trainer_client_relationships r where (r.trainer_id = auth.uid() and r.client_id = u) or (r.client_id = auth.uid() and r.trainer_id = u));
$$;
revoke all on function related_to_caller(uuid) from public, anon;
grant execute on function related_to_caller(uuid) to authenticated, service_role;

create or replace function has_consent(u uuid, t consent_type) returns boolean language sql stable security definer set search_path = public as $$
  select related_to_caller(u) and exists (select 1 from consents where user_id = u and type = t and revoked_at is null);
$$;
create or replace function trainer_capacity(t uuid) returns integer language sql stable security definer set search_path = public as $$
  select case when related_to_caller(t) then 20 + coalesce((select sum(quantity) from slot_purchases where trainer_id = t and status = 'approved' and slots_granted), 0)::int else 0 end;
$$;
create or replace function trainer_has_access(t uuid) returns boolean language sql stable security definer set search_path = public as $$
  select related_to_caller(t) and exists (select 1 from trainer_subscriptions s where s.trainer_id = t and (
    (s.status = 'trialing' and s.trial_ends_at > now())
    or (s.status in ('active','past_due','canceled') and s.current_period_end is not null and s.current_period_end > now())));
$$;

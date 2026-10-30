-- The support team is its own kind of account, not a trainer: no 7-day trial, no subscription, no students, and its own panel (/staff).
-- ADD VALUE cannot be used in the same transaction that adds it, so nothing below *executes* with 'staff'; the functions only
-- run later (from scripts/ops/add-support-staff.mjs), in their own transactions.
alter type user_role add value if not exists 'staff';

-- Turns an existing account into a member of the support team. Refuses when the account already holds trainer data
-- (students, plans), so a real trainer is never converted by mistake. Service role only.
create function make_support_staff(p_user uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare cur user_role;
begin
  select role into cur from profiles where id = p_user;
  if not found then raise exception 'no profile'; end if;
  if cur = 'client' then raise exception 'is a client'; end if;
  if cur = 'trainer' then
    if exists (select 1 from trainer_client_relationships where trainer_id = p_user)
       or exists (select 1 from training_plans where trainer_id = p_user)
       or exists (select 1 from slot_purchases where trainer_id = p_user and status = 'approved')
       or exists (select 1 from subscription_payments where trainer_id = p_user and status = 'approved') then
      raise exception 'account has trainer data';
    end if;
    update profiles set role = 'staff'::user_role where id = p_user;
    delete from trainer_subscriptions where trainer_id = p_user;        -- no trial, no billing: staff never pays
  end if;
  insert into support_staff (user_id) values (p_user) on conflict do nothing;
  return jsonb_build_object('user', p_user, 'was', cur);
end $$;

-- Removes the team membership. The account keeps role 'staff' but can reach nothing (every staff page checks support_staff).
create function remove_support_staff(p_user uuid) returns void language sql security definer set search_path = public as $$
  delete from support_staff where user_id = p_user;
$$;

revoke all on function make_support_staff(uuid), remove_support_staff(uuid) from public, anon, authenticated;
grant execute on function make_support_staff(uuid), remove_support_staff(uuid) to service_role;

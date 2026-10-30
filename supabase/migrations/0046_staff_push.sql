-- The support team can subscribe a device to web push (a trainer wrote to support → notification), like trainers already could.
-- Same rules as before otherwise: 10 devices at most, the endpoint is unique per browser and moves with whoever signs in there.
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text default null) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if (select role from profiles where id = me) not in ('trainer', 'staff') then raise exception 'forbidden'; end if;
  if (select count(*) from push_subscriptions where user_id = me) >= 10 and not exists (select 1 from push_subscriptions where endpoint = p_endpoint and user_id = me) then raise exception 'too many devices'; end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values (me, p_endpoint, p_p256dh, p_auth, left(p_ua, 300))
    on conflict (endpoint) do update set user_id = me, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end $$;

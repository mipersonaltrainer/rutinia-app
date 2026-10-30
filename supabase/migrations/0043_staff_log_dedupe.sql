-- The support panel re-renders a conversation often (live updates), and each render wrote a line: 107 lines in 73 seconds for one person
-- looking at one thread. Looking at the same record again within 10 minutes is the same access, so it is recorded once. Deliberate acts
-- (reply, close, send campaign) are never collapsed: each one is its own line.
create or replace function staff_log_access(p_action text, p_target uuid default null, p_ref text default null) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not is_support_staff() then raise exception 'forbidden'; end if;
  if p_action in ('view_trainer', 'view_thread') then
    perform pg_advisory_xact_lock(hashtextextended('stafflog:' || me::text || p_action || coalesce(p_target::text, '') || coalesce(p_ref, ''), 0));   -- two renders at once still leave one line
    if exists (select 1 from staff_access_log where actor_id = me and action = p_action and target_user is not distinct from p_target
               and ref is not distinct from left(p_ref, 80) and at > now() - interval '10 minutes') then return; end if;
  end if;
  insert into staff_access_log (actor_id, action, target_user, ref) values (me, p_action, p_target, left(p_ref, 80));
end $$;

-- Accountability for the support team: each time a staff member opens a user's record or conversation, the page records who, what and
-- whom (never the content). The table has RLS on and no policy and no grant for API roles: the only way in is staff_log_access(), which
-- takes the actor from the session, so a staff member can neither forge another's name nor erase a line. Service role / DBA read it.
create table staff_access_log (
  id bigserial primary key,
  actor_id uuid not null references profiles(id) on delete cascade,
  action text not null check (action in ('view_trainer', 'view_thread', 'reply_thread', 'close_thread', 'send_campaign')),
  target_user uuid references profiles(id) on delete set null,
  ref text check (ref is null or length(ref) <= 80),
  at timestamptz not null default now()
);
create index on staff_access_log (actor_id, at desc);
create index on staff_access_log (target_user, at desc);
alter table staff_access_log enable row level security;
revoke all on staff_access_log from anon, authenticated;
revoke all on sequence staff_access_log_id_seq from anon, authenticated;

create function staff_log_access(p_action text, p_target uuid default null, p_ref text default null) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_support_staff() then raise exception 'forbidden'; end if;
  insert into staff_access_log (actor_id, action, target_user, ref) values (auth.uid(), p_action, p_target, left(p_ref, 80));
end $$;
revoke all on function staff_log_access(text, uuid, text) from public, anon;
grant execute on function staff_log_access(text, uuid, text) to authenticated;

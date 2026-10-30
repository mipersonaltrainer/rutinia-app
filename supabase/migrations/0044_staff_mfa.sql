-- Second factor for the support team, enforced in the database so it covers every page, action and function at once (not only the screens).
-- security_settings.staff_mfa_required is OFF until the team has enrolled an authenticator app; then the owner flips it with one UPDATE
-- (service role / SQL editor). While it is on, is_support_staff() is true only for a session that passed the TOTP challenge (aal2).
-- is_support_staff_member() ignores the second factor: it only says "this account is on the team", so the app can send an
-- un-challenged staff member to the enrolment/verification screen instead of treating them as a stranger.
create table security_settings (
  id boolean primary key default true check (id),
  staff_mfa_required boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into security_settings (id) values (true);
alter table security_settings enable row level security;
revoke all on security_settings from anon, authenticated;

create function is_support_staff_member() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from support_staff where user_id = auth.uid())
$$;
create or replace function is_support_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from support_staff where user_id = auth.uid())
    and (not (select staff_mfa_required from security_settings where id) or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
$$;
revoke all on function is_support_staff_member() from public, anon;
grant execute on function is_support_staff_member() to authenticated;

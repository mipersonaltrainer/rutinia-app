-- publish_version() is SECURITY DEFINER (runs as owner); direct client updates run as 'authenticated'.
create or replace function guard_version_update() returns trigger language plpgsql as $$
begin
  if old.status = 'published' then raise exception 'published versions are immutable'; end if;
  if current_user in ('authenticated','anon') and (new.status = 'published' or new.plan_id <> old.plan_id or new.version_no <> old.version_no or new.published_at is distinct from old.published_at or new.risk_override_reason is distinct from old.risk_override_reason) then
    raise exception 'use publish_version()'; end if;
  return new;
end $$;

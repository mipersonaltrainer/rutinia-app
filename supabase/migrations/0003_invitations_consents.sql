alter table invitations add column full_name text;
alter table invitations add column accepted_at timestamptz;
alter table invitations add column accepted_by uuid references profiles(id);
-- one open invitation per trainer+email
create unique index invitations_open_unique on invitations (trainer_id, lower(email)) where status = 'pending';

create type consent_type as enum ('personal_data','health_data','photos','share_with_trainer','communications','anonymized_analytics');
create table consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type consent_type not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, type)
);
alter table consents enable row level security;
create policy consents_self on consents for select using (user_id = auth.uid());
create policy consents_revoke on consents for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Atomically claim a pending, unexpired invitation (single use). Service role only.
create function claim_invitation(p_hash text) returns invitations language plpgsql security definer set search_path = public as $$
declare inv invitations;
begin
  update invitations set status = 'expired' where token_hash = p_hash and status = 'pending' and expires_at is not null and expires_at <= now();
  update invitations set status = 'accepted', accepted_at = now()
    where token_hash = p_hash and status = 'pending' and (expires_at is null or expires_at > now())
    returning * into inv;
  return inv;   -- null row if unusable
end $$;
create function release_invitation(p_id uuid) returns void language sql security definer set search_path = public as $$
  update invitations set status = 'pending', accepted_at = null, accepted_by = null where id = p_id and status = 'accepted' and accepted_by is null;
$$;
revoke execute on function claim_invitation(text), release_invitation(uuid) from public, anon, authenticated;
grant execute on function claim_invitation(text), release_invitation(uuid) to service_role;

-- A trainer can only revoke their own pending invitations (no other transitions from the client side).
create function guard_invitation_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not (old.status = 'pending' and new.status = 'revoked'
     and new.token_hash = old.token_hash and new.trainer_id = old.trainer_id and new.email = old.email) then
    raise exception 'only revocation of pending invitations is allowed';
  end if;
  return new;
end $$;
create trigger trg_guard_invitation before update on invitations for each row execute function guard_invitation_update();

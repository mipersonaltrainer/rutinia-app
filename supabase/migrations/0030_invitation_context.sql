-- Re-linking an existing client through a NEW invitation.
-- The invitation page must know, for a token, whether the invited e-mail already has an account (and of what kind) so it can ask the person
-- to sign in instead of creating a second account. That lookup reads auth.users, so it lives in a function that only the service role can run:
-- callers need the secret token to ask, and nothing is ever exposed to anonymous or signed-in users directly.
create function invitation_context(p_hash text)
returns table (invitation_id uuid, email text, trainer_id uuid, trainer_name text, usable boolean, account_id uuid, account_role user_role)
language sql stable security definer set search_path = public as $$
  select i.id, i.email, i.trainer_id, p.full_name,
         (i.status = 'pending' and (i.expires_at is null or i.expires_at > now())),
         u.id, pr.role
  from invitations i
  join profiles p on p.id = i.trainer_id
  left join auth.users u on lower(u.email) = lower(i.email)
  left join profiles pr on pr.id = u.id
  where i.token_hash = p_hash;
$$;
revoke execute on function invitation_context(text) from public, anon, authenticated;
grant execute on function invitation_context(text) to service_role;

-- SEC-004 follow-up. AI drafts written by a trainer ABOUT a student (ai_interactions.client_id) are personal data of that student, but the
-- student cannot read them (the row belongs to the trainer), so their export left them out. This returns the caller's own rows only.
create function my_ai_interactions_about_me() returns table (kind text, status text, created_at timestamptz, output jsonb, violations jsonb)
language sql stable security definer set search_path = public as $$
  select kind, status, created_at, output, violations from ai_interactions where client_id = auth.uid() order by created_at;
$$;
revoke all on function my_ai_interactions_about_me() from public, anon;
grant execute on function my_ai_interactions_about_me() to authenticated;

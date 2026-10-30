-- Defense in depth. Supabase grants the signed-out role (anon) full privileges on every new table in public; until now only RLS stood between
-- an anonymous request and the data. The app never reads or writes tables as a signed-out visitor (sign-in goes through the Auth API,
-- invitations and webhooks use the service role on the server), so anon gets nothing, and neither do tables created later.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

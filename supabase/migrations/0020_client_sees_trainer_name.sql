-- A client may read the profile (name only: the table holds no other personal data) of their own active trainer,
-- needed to label the conversation. Nothing else about other users becomes visible.
create policy profiles_client_sees_trainer on profiles for select using (
  exists (select 1 from trainer_client_relationships r where r.client_id = auth.uid() and r.trainer_id = profiles.id and r.status = 'active'));

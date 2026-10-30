-- GoTrue writes app_metadata after the initial insert, so the insert trigger alone cannot see it.
-- Convert trainer -> client when the (server-only) app_metadata role becomes 'client'.
create function sync_client_role() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.raw_app_meta_data->>'role' = 'client' then
    update profiles set role = 'client' where id = new.id and role = 'trainer';
    delete from trainer_subscriptions where trainer_id = new.id
      and not exists (select 1 from trainer_client_relationships r where r.trainer_id = new.id);
  end if;
  return new;
end $$;
create trigger on_auth_user_role_sync after update of raw_app_meta_data on auth.users
  for each row execute function sync_client_role();

-- repair rows created before this fix
update profiles p set role = 'client' from auth.users u
  where u.id = p.id and u.raw_app_meta_data->>'role' = 'client' and p.role = 'trainer';
delete from trainer_subscriptions s using profiles p where p.id = s.trainer_id and p.role = 'client';

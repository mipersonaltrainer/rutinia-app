-- Self-signup always creates a trainer. Client accounts are created server-side
-- (service role) with app_metadata.role = 'client'; app_metadata is not user-editable.
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare r user_role := coalesce((new.raw_app_meta_data->>'role')::user_role, 'trainer');
begin
  insert into profiles (id, role, full_name)
    values (new.id, r, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  if r = 'trainer' then
    insert into trainer_subscriptions (trainer_id) values (new.id);  -- 7-day trial from server clock
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- sha256() is built in (PG 11+); pgcrypto's digest() lives in the `extensions` schema on Supabase and is not on the function search_path.
create or replace function erase_client(p_client uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare paths text[]; role_ user_role; counts jsonb;
begin
  select role into role_ from profiles where id = p_client;
  if role_ is distinct from 'client' then raise exception 'not a client account'; end if;
  perform set_config('app.erasure', 'on', true);
  select coalesce(array_agg(storage_path), '{}') into paths from progress_photos where client_id = p_client;
  delete from recommendation_decisions where recommendation_id in (select id from coach_recommendations where client_id = p_client);
  delete from coach_recommendations where client_id = p_client;
  delete from workout_logs where client_id = p_client;                 -- sets and discomforts cascade (guards bypassed during erasure)
  delete from training_plans where client_id = p_client;               -- versions, sessions, prescriptions, private notes cascade
  update invitations set accepted_by = null where accepted_by = p_client;
  delete from access_audit where client_id = p_client;
  delete from progress_reports where client_id = p_client;
  delete from trainer_client_relationships where client_id = p_client;
  insert into erasure_log (subject_hash, role, kind) values (encode(sha256(convert_to(p_client::text, 'UTF8')), 'hex'), 'client', 'client_erasure');
  delete from profiles where id = p_client;                            -- cascades relationships, consents, assessments, measurements, results, photos, schedules, notifications
  return jsonb_build_object('storage_paths', to_jsonb(paths));
end $$;

create or replace function close_trainer_account(p_trainer uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare role_ user_role;
begin
  select role into role_ from profiles where id = p_trainer;
  if role_ is distinct from 'trainer' then raise exception 'not a trainer account'; end if;
  update trainer_client_relationships set status = 'archived' where trainer_id = p_trainer;
  update training_plans set archived_at = now() where trainer_id = p_trainer and archived_at is null;
  delete from recommendation_decisions where decided_by = p_trainer or recommendation_id in (select id from coach_recommendations where trainer_id = p_trainer);
  delete from coach_recommendations where trainer_id = p_trainer;
  delete from invitations where trainer_id = p_trainer and status = 'pending';
  delete from notifications where user_id = p_trainer;
  delete from consents where user_id = p_trainer;
  delete from photo_schedules where trainer_id = p_trainer;
  update trainer_subscriptions set status = 'expired', current_period_end = now(), updated_at = now() where trainer_id = p_trainer;
  update profiles set full_name = 'Cuenta cerrada' where id = p_trainer;   -- profile row stays: billing records are retained for accounting
  insert into erasure_log (subject_hash, role, kind) values (encode(sha256(convert_to(p_trainer::text, 'UTF8')), 'hex'), 'trainer', 'trainer_closure');
  return jsonb_build_object('closed', true);
end $$;


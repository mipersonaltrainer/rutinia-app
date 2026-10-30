-- Security audit, phase 1 follow-ups: SEC-003, SEC-005, SEC-007 and SEC-008 (see docs/SECURITY.md).

-- ===== SEC-003: derived and safety-relevant rows are written by the server, never by the user ==========================================
-- Assessments carry a risk level computed on the server; calculation_results are the platform's own indicators; a workout log must point at a session
-- of the client's CURRENT plan. A user could write any of these directly through the public API with whatever values they liked.
drop policy as_insert on assessments;
drop policy as_update on assessments;
revoke insert, update, delete, truncate on assessments from anon, authenticated;
drop policy cr_insert on calculation_results;
revoke insert, update, delete, truncate on calculation_results from anon, authenticated;
drop policy wl_ins on workout_logs;
revoke insert, delete, truncate on workout_logs from anon, authenticated;          -- UPDATE stays: the client edits their open log (policy wl_upd, guarded by trigger)

-- start_workout is now the only way to open a log, so it runs with the owner's rights; it still decides everything from auth.uid().
create or replace function start_workout(p_session uuid, p_recovery smallint default null) returns uuid language plpgsql security definer set search_path = public as $$
declare s plan_sessions; t training_plans; existing workout_logs; lid uuid; n int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into s from plan_sessions where id = p_session;
  select tp.* into t from training_plans tp join plan_versions v on v.plan_id = tp.id where v.id = s.version_id;
  if s.id is null or t.client_id is distinct from auth.uid() or t.current_version_id is distinct from s.version_id then raise exception 'session is not part of your current plan'; end if;
  select * into existing from workout_logs where client_id = auth.uid() and status = 'in_progress';
  if existing.id is not null then
    if existing.session_id = p_session then return existing.id; end if;   -- resume
    raise exception 'finish or abandon your current workout first';
  end if;
  select coalesce(sum(sets),0) into n from prescribed_exercises where session_id = p_session;
  insert into workout_logs (client_id, plan_id, version_id, session_id, recovery_rating, planned_sets) values (auth.uid(), t.id, s.version_id, p_session, p_recovery, n) returning id into lid;
  return lid;
end $$;
revoke execute on function start_workout(uuid, smallint) from public, anon;
grant execute on function start_workout(uuid, smallint) to authenticated;

-- ===== SEC-005: erasing a client also removes what the trainer was told about them ==============================================
-- Trainer notifications name the client in their title and link to /trainer/clients/<id>; they belong to the trainer's inbox, so the cascade from
-- the client's profile never reached them.
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
  delete from notifications where link like '%' || p_client::text || '%';       -- the trainers' notifications about this client
  delete from trainer_client_relationships where client_id = p_client;
  insert into erasure_log (subject_hash, role, kind) values (encode(sha256(convert_to(p_client::text, 'UTF8')), 'hex'), 'client', 'client_erasure');
  delete from profiles where id = p_client;                            -- cascades relationships, consents, assessments, measurements, results, photos, schedules, notifications, nutrition plans
  return jsonb_build_object('storage_paths', to_jsonb(paths));
end $$;

-- ===== SEC-007: the AI audit trail cannot be attributed to a client the caller cannot access, nor carry made-up statuses ==================
create or replace function ai_finish(p_usage uuid, p_status text, p_provider text, p_model text, p_in int, p_out int, p_ms int, p_client uuid, p_digest text, p_output jsonb, p_violations jsonb, p_flags text[], p_inter_status text)
returns uuid language plpgsql security definer set search_path = public as $$
declare u ai_usage; iid uuid;
begin
  if p_status not in ('ok', 'error') or p_inter_status not in ('ok', 'rejected', 'error') then raise exception 'invalid status'; end if;
  if p_client is not null and not can_access_client(p_client) then raise exception 'no access to that client'; end if;
  select * into u from ai_usage where id = p_usage and user_id = auth.uid() and status = 'reserved' for update;
  if u.id is null then raise exception 'unknown usage'; end if;
  update ai_usage set status = p_status, provider = p_provider, model = p_model, input_tokens = greatest(0, coalesce(p_in, 0)), output_tokens = greatest(0, coalesce(p_out, 0)), latency_ms = p_ms where id = u.id;
  insert into ai_interactions (usage_id, user_id, client_id, kind, input_digest, output, violations, flags, status)
    values (u.id, u.user_id, p_client, u.kind, p_digest, p_output, coalesce(p_violations, '[]'), coalesce(p_flags, '{}'), p_inter_status) returning id into iid;
  return iid;
end $$;

-- ===== SEC-008: photos, reviews and notifications ==============================================================================
-- Photos are stored by the server only (EXIF stripping, re-encoding and the daily cap live there); a user can no longer push files straight into the bucket.
drop policy photos_insert on storage.objects;
-- …and the daily cap is also a database rule, so inserting rows directly cannot get around it either.
create function guard_photo_daily_limit() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and (select count(*) from progress_photos where client_id = new.client_id and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'daily photo limit reached';
  end if;
  return new;
end $$;
create trigger trg_photo_daily_limit before insert on progress_photos for each row execute function guard_photo_daily_limit();
revoke execute on function guard_photo_daily_limit() from public, anon;

-- A trainer can revise their own review (the screen saves with an upsert), and sees it only while they may still see that client's photos.
drop policy pr_select on photo_reviews;
create policy pr_select on photo_reviews for select using (
  (trainer_id = auth.uid() and exists (select 1 from progress_photos p where p.id = photo_reviews.photo_id and photo_access(p.client_id)))
  or exists (select 1 from progress_photos p where p.id = photo_reviews.photo_id and p.client_id = auth.uid()));
create policy pr_update on photo_reviews for update
  using (trainer_id = auth.uid() and exists (select 1 from progress_photos p where p.id = photo_reviews.photo_id and photo_access(p.client_id) and p.client_id <> auth.uid()))
  with check (trainer_id = auth.uid());

-- The only thing a user may change on a notification is whether it was read.
revoke update on notifications from anon, authenticated;
grant update (read_at) on notifications to authenticated;

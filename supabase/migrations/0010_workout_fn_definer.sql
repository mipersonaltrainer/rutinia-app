-- finish/abandon change computed counters, which clients cannot write directly: run as owner with explicit ownership checks.
create or replace function finish_workout(p_log uuid, p_rpe smallint, p_pain smallint, p_pain_notes text, p_notes text) returns void language plpgsql security definer set search_path = public as $$
declare c int;
begin
  select count(*) into c from logged_sets where log_id = p_log and kind = 'work';
  update workout_logs set status = 'completed', finished_at = now(), session_rpe = p_rpe, pain_level = p_pain, pain_notes = nullif(p_pain_notes,''), notes = nullif(p_notes,''), logged_work_sets = c
    where id = p_log and client_id = auth.uid() and status = 'in_progress';
  if not found then raise exception 'workout not found or already finished'; end if;
end $$;
create or replace function abandon_workout(p_log uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update workout_logs set status = 'abandoned', finished_at = now(), logged_work_sets = (select count(*) from logged_sets where log_id = p_log and kind = 'work')
    where id = p_log and client_id = auth.uid() and status = 'in_progress';
end $$;
revoke execute on function finish_workout(uuid, smallint, smallint, text, text), abandon_workout(uuid) from public, anon;
grant execute on function finish_workout(uuid, smallint, smallint, text, text), abandon_workout(uuid) to authenticated;

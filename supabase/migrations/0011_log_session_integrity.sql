-- Sets must belong to the exact session being logged, not just to the same plan version.
create function log_session(l uuid) returns uuid language sql stable security definer set search_path = public as $$
  select session_id from workout_logs where id = l;
$$;
create or replace function guard_log_children() returns trigger language plpgsql security definer set search_path = public as $$
declare st record; sid uuid;
begin
  select * into st from log_state(coalesce(new.log_id, old.log_id));
  if st.status is distinct from 'in_progress' then raise exception 'finished workouts are immutable'; end if;
  if tg_op <> 'DELETE' and tg_table_name = 'logged_sets' then
    select session_id into sid from prescribed_exercises where id = new.prescribed_exercise_id;
    if sid is distinct from log_session(new.log_id) then raise exception 'exercise does not belong to this workout'; end if;
    if not exists (select 1 from prescribed_exercises where id = new.prescribed_exercise_id and exercise_id = new.exercise_id) then raise exception 'exercise mismatch'; end if;
    new.updated_at := now();
  end if;
  return coalesce(new, old);
end $$;

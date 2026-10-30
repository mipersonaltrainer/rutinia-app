create table workout_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  plan_id uuid not null references training_plans(id),
  version_id uuid not null references plan_versions(id),      -- the exact published version performed
  session_id uuid not null references plan_sessions(id),
  status text not null default 'in_progress' check (status in ('in_progress','completed','abandoned')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  recovery_rating smallint check (recovery_rating between 1 and 5),   -- pre-session readiness
  session_rpe smallint check (session_rpe between 1 and 10),
  pain_level smallint check (pain_level between 0 and 10),
  pain_notes text check (length(pain_notes) <= 500),
  notes text check (length(notes) <= 1000),
  planned_sets int,
  logged_work_sets int,
  created_at timestamptz not null default now()
);
create unique index one_active_workout on workout_logs (client_id) where status = 'in_progress';
create index on workout_logs (client_id, started_at desc);

create table logged_sets (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references workout_logs(id) on delete cascade,
  prescribed_exercise_id uuid not null references prescribed_exercises(id),
  exercise_id uuid not null references exercises(id),
  kind text not null default 'work' check (kind in ('warmup','work')),
  set_number smallint not null check (set_number between 1 and 30),
  reps smallint check (reps between 0 and 200),
  load_kg numeric(6,1) check (load_kg between 0 and 1000),
  duration_sec int check (duration_sec between 1 and 7200),
  rpe numeric(3,1) check (rpe between 1 and 10),
  rir smallint check (rir between 0 and 10),
  note text check (length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (log_id, prescribed_exercise_id, kind, set_number),
  check (reps is not null or duration_sec is not null),
  check (rpe is null or rir is null)
);
create index on logged_sets (exercise_id, created_at);

create table exercise_discomforts (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references workout_logs(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  severity smallint not null check (severity between 1 and 10),
  area text check (area in ('shoulder','elbow','wrist','knee','hip','ankle','lower_back','neck','other')),
  note text check (length(note) <= 300),
  created_at timestamptz not null default now(),
  unique (log_id, exercise_id)
);

-- helper (definer: avoids RLS recursion)
create function log_state(l uuid) returns table (client_id uuid, status text, version_id uuid) language sql stable security definer set search_path = public as $$
  select client_id, status, version_id from workout_logs where id = l;
$$;
create function log_is_open(l uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from workout_logs where id = l and status = 'in_progress' and client_id = auth.uid());
$$;

-- completed/abandoned logs and their children are immutable; sets must belong to the log's version
create function guard_log_update() returns trigger language plpgsql as $$
begin
  if old.status <> 'in_progress' then raise exception 'finished workouts are immutable'; end if;
  if current_user in ('authenticated','anon') and (new.client_id <> old.client_id or new.plan_id <> old.plan_id or new.version_id <> old.version_id or new.session_id <> old.session_id or new.started_at <> old.started_at or new.planned_sets is distinct from old.planned_sets or new.logged_work_sets is distinct from old.logged_work_sets) then
    raise exception 'immutable fields'; end if;
  return new;
end $$;
create trigger trg_guard_log before update on workout_logs for each row execute function guard_log_update();

create function guard_log_children() returns trigger language plpgsql security definer set search_path = public as $$
declare st record; v uuid;
begin
  select * into st from log_state(coalesce(new.log_id, old.log_id));
  if st.status is distinct from 'in_progress' then raise exception 'finished workouts are immutable'; end if;
  if tg_op <> 'DELETE' and tg_table_name = 'logged_sets' then
    select s.version_id into v from prescribed_exercises pe join plan_sessions s on s.id = pe.session_id where pe.id = new.prescribed_exercise_id;
    if v is distinct from st.version_id then raise exception 'exercise does not belong to this workout'; end if;
    if not exists (select 1 from prescribed_exercises where id = new.prescribed_exercise_id and exercise_id = new.exercise_id) then raise exception 'exercise mismatch'; end if;
    new.updated_at := now();
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_guard_sets before insert or update or delete on logged_sets for each row execute function guard_log_children();
create trigger trg_guard_disc before insert or update or delete on exercise_discomforts for each row execute function guard_log_children();

alter table workout_logs enable row level security;
alter table logged_sets enable row level security;
alter table exercise_discomforts enable row level security;

create policy wl_client_sel on workout_logs for select using (client_id = auth.uid() and plan_client_ok(plan_id));
create policy wl_trainer_sel on workout_logs for select using (can_access_client(client_id) and client_id <> auth.uid());
create policy wl_ins on workout_logs for insert with check (client_id = auth.uid() and plan_client_ok(plan_id) and status = 'in_progress');
create policy wl_upd on workout_logs for update using (client_id = auth.uid() and status = 'in_progress') with check (client_id = auth.uid());
create policy ls_sel on logged_sets for select using (exists (select 1 from log_state(log_id) s where s.client_id = auth.uid()) or exists (select 1 from log_state(log_id) s where can_access_client(s.client_id)));
create policy ls_write on logged_sets for all using (log_is_open(log_id)) with check (log_is_open(log_id));
create policy ed_sel on exercise_discomforts for select using (exists (select 1 from log_state(log_id) s where s.client_id = auth.uid()) or exists (select 1 from log_state(log_id) s where can_access_client(s.client_id)));
create policy ed_write on exercise_discomforts for all using (log_is_open(log_id)) with check (log_is_open(log_id));

-- operations -------------------------------------------------------------------------
create function start_workout(p_session uuid, p_recovery smallint default null) returns uuid language plpgsql as $$
declare s plan_sessions; t training_plans; existing workout_logs; lid uuid; n int;
begin
  select * into s from plan_sessions where id = p_session;
  if s.id is null then raise exception 'session not found'; end if;
  select tp.* into t from training_plans tp join plan_versions v on v.plan_id = tp.id where v.id = s.version_id;
  if t.client_id is distinct from auth.uid() or t.current_version_id is distinct from s.version_id then raise exception 'session is not part of your current plan'; end if;
  select * into existing from workout_logs where client_id = auth.uid() and status = 'in_progress';
  if existing.id is not null then
    if existing.session_id = p_session then return existing.id; end if;   -- resume
    raise exception 'finish or abandon your current workout first';
  end if;
  select coalesce(sum(sets),0) into n from prescribed_exercises where session_id = p_session;
  insert into workout_logs (client_id, plan_id, version_id, session_id, recovery_rating, planned_sets) values (auth.uid(), t.id, s.version_id, p_session, p_recovery, n) returning id into lid;
  return lid;
end $$;

create function finish_workout(p_log uuid, p_rpe smallint, p_pain smallint, p_pain_notes text, p_notes text) returns void language plpgsql as $$
declare c int;
begin
  select count(*) into c from logged_sets where log_id = p_log and kind = 'work';
  update workout_logs set status = 'completed', finished_at = now(), session_rpe = p_rpe, pain_level = p_pain, pain_notes = nullif(p_pain_notes,''), notes = nullif(p_notes,''), logged_work_sets = c
    where id = p_log and client_id = auth.uid() and status = 'in_progress';
  if not found then raise exception 'workout not found or already finished'; end if;
end $$;

create function abandon_workout(p_log uuid) returns void language plpgsql as $$
begin
  update workout_logs set status = 'abandoned', finished_at = now(), logged_work_sets = (select count(*) from logged_sets where log_id = p_log and kind = 'work')
    where id = p_log and client_id = auth.uid() and status = 'in_progress';
end $$;

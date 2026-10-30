create table training_plans (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references profiles(id),
  client_id uuid references profiles(id),
  title text not null check (length(title) between 2 and 120),
  goal text,
  level text check (level in ('beginner','intermediate','advanced')),
  is_template boolean not null default false,
  source_template_id uuid references training_plans(id) on delete set null,
  current_version_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (is_template = (client_id is null))
);
create index on training_plans (trainer_id, is_template);
create index on training_plans (client_id);

create table plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references training_plans(id) on delete cascade,
  version_no int not null,
  status text not null default 'draft' check (status in ('draft','published')),
  change_note text,
  risk_override_reason text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (plan_id, version_no)
);
create unique index one_draft_per_plan on plan_versions (plan_id) where status = 'draft';
alter table training_plans add constraint fk_current_version foreign key (current_version_id) references plan_versions(id);

create table plan_sessions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references plan_versions(id) on delete cascade,
  position int not null,
  name text not null check (length(name) between 1 and 80),
  weekday smallint check (weekday between 1 and 7),
  warmup_notes text,
  unique (version_id, position) deferrable initially deferred
);
create table prescribed_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references plan_sessions(id) on delete cascade,
  position int not null,
  exercise_id uuid not null references exercises(id),
  alternative_exercise_id uuid references exercises(id),
  warmup_sets smallint not null default 0 check (warmup_sets between 0 and 10),
  sets smallint not null default 3 check (sets between 1 and 20),
  reps_min smallint check (reps_min between 1 and 100),
  reps_max smallint check (reps_max between 1 and 100),
  duration_sec int check (duration_sec between 5 and 7200),
  load_kg numeric(6,1) check (load_kg >= 0 and load_kg <= 1000),
  rpe numeric(3,1) check (rpe between 1 and 10),
  rir smallint check (rir between 0 and 10),
  rest_sec int check (rest_sec between 0 and 1200),
  tempo text check (tempo ~ '^[0-9X]{4}$'),
  superset_group text check (length(superset_group) <= 3),
  progression text not null default 'none' check (progression in ('none','double_progression','linear_load','rpe_based')),
  client_notes text,
  unique (session_id, position) deferrable initially deferred,
  check (reps_min is not null or duration_sec is not null),
  check (reps_max is null or reps_min is null or reps_max >= reps_min)
);
create table prescribed_private_notes (
  prescribed_id uuid primary key references prescribed_exercises(id) on delete cascade,
  trainer_id uuid not null references profiles(id),
  note text not null check (length(note) <= 1000)
);

-- helpers (security definer to avoid RLS recursion) ---------------------------------
create function plan_trainer_ok(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from training_plans t where t.id = p and t.trainer_id = auth.uid() and trainer_has_access(t.trainer_id));
$$;
create function plan_client_ok(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from training_plans t where t.id = p and t.client_id = auth.uid() and trainer_has_access(t.trainer_id)
    and exists (select 1 from trainer_client_relationships r where r.trainer_id = t.trainer_id and r.client_id = t.client_id and r.status = 'active'));
$$;
create function version_plan(v uuid) returns uuid language sql stable security definer set search_path = public as $$ select plan_id from plan_versions where id = v; $$;
create function session_version(s uuid) returns uuid language sql stable security definer set search_path = public as $$ select version_id from plan_sessions where id = s; $$;
create function version_is_draft(v uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from plan_versions where id = v and status = 'draft'); $$;
create function version_is_published(v uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from plan_versions where id = v and status = 'published'); $$;

-- immutability of published versions ------------------------------------------------
create function guard_published_children() returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if tg_table_name = 'plan_sessions' then v := coalesce(new.version_id, old.version_id);
  else v := session_version(coalesce(new.session_id, old.session_id)); end if;
  if v is not null and version_is_published(v) then raise exception 'published plan versions are immutable; create a new version'; end if;
  return coalesce(new, old);
end $$;
create trigger trg_guard_sessions before insert or update or delete on plan_sessions for each row execute function guard_published_children();
create trigger trg_guard_prescribed before insert or update or delete on prescribed_exercises for each row execute function guard_published_children();
create function guard_version_update() returns trigger language plpgsql as $$
begin
  if old.status = 'published' then raise exception 'published versions are immutable'; end if;
  if auth.uid() is not null and (new.status = 'published' or new.plan_id <> old.plan_id or new.version_no <> old.version_no) then
    raise exception 'use publish_version()'; end if;
  return new;
end $$;
create trigger trg_guard_version before update on plan_versions for each row execute function guard_version_update();
create function guard_version_delete() returns trigger language plpgsql as $$
begin if old.status = 'published' and exists (select 1 from training_plans where id = old.plan_id) then raise exception 'published versions cannot be deleted'; end if; return old; end $$;
create trigger trg_guard_version_del before delete on plan_versions for each row execute function guard_version_delete();

-- RLS -------------------------------------------------------------------------------
alter table training_plans enable row level security;
alter table plan_versions enable row level security;
alter table plan_sessions enable row level security;
alter table prescribed_exercises enable row level security;
alter table prescribed_private_notes enable row level security;

create policy tp_trainer_sel on training_plans for select using (trainer_id = auth.uid() and trainer_has_access(auth.uid()));
create policy tp_client_sel on training_plans for select using (plan_client_ok(id));
create policy tp_ins on training_plans for insert with check (trainer_id = auth.uid() and trainer_has_access(auth.uid())
  and (client_id is null or exists (select 1 from trainer_client_relationships r where r.trainer_id = auth.uid() and r.client_id = training_plans.client_id and r.status = 'active')));
create policy tp_upd on training_plans for update using (trainer_id = auth.uid() and trainer_has_access(auth.uid())) with check (trainer_id = auth.uid());

create policy pv_trainer on plan_versions for select using (plan_trainer_ok(plan_id));
create policy pv_client on plan_versions for select using (status = 'published' and plan_client_ok(plan_id));
create policy pv_ins on plan_versions for insert with check (plan_trainer_ok(plan_id) and created_by = auth.uid() and status = 'draft');
create policy pv_upd on plan_versions for update using (plan_trainer_ok(plan_id) and status = 'draft') with check (plan_trainer_ok(plan_id));

create policy ps_trainer on plan_sessions for all using (plan_trainer_ok(version_plan(version_id))) with check (plan_trainer_ok(version_plan(version_id)));
create policy ps_client on plan_sessions for select using (version_is_published(version_id) and plan_client_ok(version_plan(version_id)));
create policy pe_trainer on prescribed_exercises for all using (plan_trainer_ok(version_plan(session_version(session_id)))) with check (plan_trainer_ok(version_plan(session_version(session_id))));
create policy pe_client on prescribed_exercises for select using (version_is_published(session_version(session_id)) and plan_client_ok(version_plan(session_version(session_id))));
create policy pn_trainer on prescribed_private_notes for all using (trainer_id = auth.uid() and plan_trainer_ok(version_plan(session_version((select session_id from prescribed_exercises where id = prescribed_id)))))
  with check (trainer_id = auth.uid());
-- private notes: no client policy at all.

-- operations -------------------------------------------------------------------------
create function clone_version(src uuid, dst uuid) returns void language plpgsql as $$
declare s record; new_s uuid; e record; new_e uuid;
begin
  for s in select * from plan_sessions where version_id = src order by position loop
    insert into plan_sessions (version_id, position, name, weekday, warmup_notes) values (dst, s.position, s.name, s.weekday, s.warmup_notes) returning id into new_s;
    for e in select * from prescribed_exercises where session_id = s.id order by position loop
      insert into prescribed_exercises (session_id, position, exercise_id, alternative_exercise_id, warmup_sets, sets, reps_min, reps_max, duration_sec, load_kg, rpe, rir, rest_sec, tempo, superset_group, progression, client_notes)
        values (new_s, e.position, e.exercise_id, e.alternative_exercise_id, e.warmup_sets, e.sets, e.reps_min, e.reps_max, e.duration_sec, e.load_kg, e.rpe, e.rir, e.rest_sec, e.tempo, e.superset_group, e.progression, e.client_notes)
        returning id into new_e;
      insert into prescribed_private_notes (prescribed_id, trainer_id, note) select new_e, trainer_id, note from prescribed_private_notes where prescribed_id = e.id;
    end loop;
  end loop;
end $$;

create function create_plan(p_title text, p_goal text, p_level text, p_client uuid) returns uuid language plpgsql as $$
declare pid uuid; vid uuid;
begin
  insert into training_plans (trainer_id, client_id, title, goal, level, is_template) values (auth.uid(), p_client, p_title, p_goal, p_level, p_client is null) returning id into pid;
  insert into plan_versions (plan_id, version_no, created_by) values (pid, 1, auth.uid());
  return pid;
end $$;

create function new_draft_version(p_plan uuid, p_note text) returns uuid language plpgsql as $$
declare src uuid; vid uuid; n int;
begin
  if exists (select 1 from plan_versions where plan_id = p_plan and status = 'draft') then raise exception 'a draft already exists'; end if;
  select id into src from plan_versions where plan_id = p_plan and status = 'published' order by version_no desc limit 1;
  select coalesce(max(version_no),0)+1 into n from plan_versions where plan_id = p_plan;
  insert into plan_versions (plan_id, version_no, change_note, created_by) values (p_plan, n, p_note, auth.uid()) returning id into vid;
  if src is not null then perform clone_version(src, vid); end if;
  return vid;
end $$;

create function assign_template(p_template uuid, p_client uuid) returns uuid language plpgsql as $$
declare t training_plans; src uuid; pid uuid; vid uuid;
begin
  select * into t from training_plans where id = p_template and is_template and trainer_id = auth.uid();
  if t.id is null then raise exception 'template not found'; end if;
  select id into src from plan_versions where plan_id = t.id and status = 'published' order by version_no desc limit 1;
  if src is null then raise exception 'publish the template first'; end if;
  insert into training_plans (trainer_id, client_id, title, goal, level, source_template_id) values (auth.uid(), p_client, t.title, t.goal, t.level, t.id) returning id into pid;
  insert into plan_versions (plan_id, version_no, change_note, created_by) values (pid, 1, 'Copia de la plantilla "' || t.title || '"', auth.uid()) returning id into vid;
  perform clone_version(src, vid);   -- an independent copy: later template edits never touch it
  return pid;
end $$;

create function publish_version(p_version uuid, p_override text default null) returns void language plpgsql security definer set search_path = public as $$
declare v plan_versions; t training_plans; risk text;
begin
  select * into v from plan_versions where id = p_version;
  select * into t from training_plans where id = v.plan_id;
  if v.id is null or t.trainer_id is distinct from auth.uid() or not trainer_has_access(auth.uid()) then raise exception 'not allowed'; end if;
  if v.status <> 'draft' then raise exception 'only drafts can be published'; end if;
  if not exists (select 1 from plan_sessions s join prescribed_exercises e on e.session_id = s.id where s.version_id = v.id) then raise exception 'plan has no exercises'; end if;
  if t.client_id is not null then
    if not exists (select 1 from trainer_client_relationships r where r.trainer_id = t.trainer_id and r.client_id = t.client_id and r.status = 'active') then raise exception 'client is not active'; end if;
    select risk_level into risk from assessments where client_id = t.client_id and status = 'submitted' order by created_at desc limit 1;
    if risk = 'professional_evaluation' and (p_override is null or length(trim(p_override)) < 15) then
      raise exception 'professional evaluation required before publishing; provide a documented reason to override';
    end if;
  end if;
  update plan_versions set status = 'published', published_at = now(), risk_override_reason = case when risk = 'professional_evaluation' then p_override end where id = v.id;
  update training_plans set current_version_id = v.id where id = t.id;
end $$;

create function move_session(p_id uuid, p_dir int) returns void language plpgsql as $$
declare cur plan_sessions; o plan_sessions;
begin
  select * into cur from plan_sessions where id = p_id;
  select * into o from plan_sessions where version_id = cur.version_id and position = cur.position + p_dir;
  if o.id is null then return; end if;
  update plan_sessions set position = o.position where id = cur.id;
  update plan_sessions set position = cur.position where id = o.id;
end $$;
create function move_exercise(p_id uuid, p_dir int) returns void language plpgsql as $$
declare cur prescribed_exercises; o prescribed_exercises;
begin
  select * into cur from prescribed_exercises where id = p_id;
  select * into o from prescribed_exercises where session_id = cur.session_id and position = cur.position + p_dir;
  if o.id is null then return; end if;
  update prescribed_exercises set position = o.position where id = cur.id;
  update prescribed_exercises set position = cur.position where id = o.id;
end $$;
create function duplicate_session(p_id uuid) returns uuid language plpgsql as $$
declare s plan_sessions; new_s uuid; e record; new_e uuid; pos int;
begin
  select * into s from plan_sessions where id = p_id;
  select coalesce(max(position),0)+1 into pos from plan_sessions where version_id = s.version_id;
  insert into plan_sessions (version_id, position, name, weekday, warmup_notes) values (s.version_id, pos, left(s.name,70) || ' (copia)', null, s.warmup_notes) returning id into new_s;
  for e in select * from prescribed_exercises where session_id = p_id order by position loop
    insert into prescribed_exercises (session_id, position, exercise_id, alternative_exercise_id, warmup_sets, sets, reps_min, reps_max, duration_sec, load_kg, rpe, rir, rest_sec, tempo, superset_group, progression, client_notes)
      values (new_s, e.position, e.exercise_id, e.alternative_exercise_id, e.warmup_sets, e.sets, e.reps_min, e.reps_max, e.duration_sec, e.load_kg, e.rpe, e.rir, e.rest_sec, e.tempo, e.superset_group, e.progression, e.client_notes) returning id into new_e;
    insert into prescribed_private_notes (prescribed_id, trainer_id, note) select new_e, trainer_id, note from prescribed_private_notes where prescribed_id = e.id;
  end loop;
  return new_s;
end $$;
revoke execute on function publish_version(uuid, text) from public, anon;
grant execute on function publish_version(uuid, text) to authenticated;

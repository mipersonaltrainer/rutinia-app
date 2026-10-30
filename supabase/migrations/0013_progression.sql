create table coach_recommendations (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references profiles(id),
  client_id uuid not null references profiles(id),
  plan_id uuid not null references training_plans(id),
  version_id uuid not null references plan_versions(id),          -- the published version the engine evaluated
  prescribed_exercise_id uuid references prescribed_exercises(id),
  scope text not null check (scope in ('exercise','client')),
  type text not null check (type in ('maintain','increase_reps','increase_load','reduce_load','reduce_volume','substitute_exercise','review_technique','deload','request_reassessment')),
  severity text not null check (severity in ('info','caution','professional')),
  confidence text not null check (confidence in ('low','medium','high')),
  title text not null,
  changes jsonb not null,
  rationale text[] not null check (cardinality(rationale) > 0),
  data_points jsonb not null,
  uncertainty text[] not null check (cardinality(uncertainty) > 0),
  checks text[] not null check (cardinality(checks) > 0),
  substitute_exercise_id uuid references exercises(id),
  engine_version text not null,
  fingerprint text not null,
  scope_key text generated always as (coalesce(prescribed_exercise_id::text, 'client:' || type)) stored,
  status text not null default 'pending' check (status in ('pending','accepted','modified','rejected','superseded','stale')),
  created_at timestamptz not null default now(),
  unique (version_id, scope_key, fingerprint)                      -- same inputs never create a duplicate
);
create index on coach_recommendations (client_id, status, created_at desc);

create table recommendation_decisions (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null unique references coach_recommendations(id),
  decided_by uuid not null references profiles(id),
  decision text not null check (decision in ('accepted','modified','rejected')),
  reason text check (reason is null or length(reason) <= 1000),
  original_changes jsonb not null,
  applied_changes jsonb,
  applied_version_id uuid references plan_versions(id),
  created_at timestamptz not null default now(),
  check (decision = 'accepted' or length(coalesce(reason,'')) >= 5)
);

alter table coach_recommendations enable row level security;
alter table recommendation_decisions enable row level security;
-- Trainer only. Clients never see proposals about themselves (no client policy, and can_access_client is NOT used because it admits the client).
create policy cr_trainer on coach_recommendations for select using (trainer_id = auth.uid() and trainer_has_access(auth.uid()) and exists (select 1 from trainer_client_relationships r where r.trainer_id = auth.uid() and r.client_id = coach_recommendations.client_id and r.status = 'active'));
create policy rd_trainer on recommendation_decisions for select using (exists (select 1 from coach_recommendations c where c.id = recommendation_id and c.trainer_id = auth.uid() and trainer_has_access(auth.uid())));
-- Writes happen only through the SECURITY DEFINER functions below (explicit ownership checks); decisions are append-only.

create or replace function publish_version(p_version uuid, p_override text default null) returns void language plpgsql security definer set search_path = public as $$
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
  update coach_recommendations set status = 'stale' where plan_id = t.id and status = 'pending' and version_id <> v.id;   -- proposals about an older version no longer apply
end $$;

create function save_recommendations(p_plan uuid, p_items jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare t training_plans; it jsonb; inserted int := 0; superseded int := 0; keys text[] := '{}'; k text; n int;
begin
  select * into t from training_plans where id = p_plan;
  if t.id is null or t.trainer_id is distinct from auth.uid() or t.client_id is null or t.current_version_id is null or not trainer_has_access(auth.uid()) then raise exception 'not allowed'; end if;
  if not exists (select 1 from trainer_client_relationships r where r.trainer_id = t.trainer_id and r.client_id = t.client_id and r.status = 'active') then raise exception 'client is not active'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if (it->>'prescribedId') is not null and not exists (select 1 from prescribed_exercises pe join plan_sessions s on s.id = pe.session_id where pe.id = (it->>'prescribedId')::uuid and s.version_id = t.current_version_id) then raise exception 'exercise does not belong to the current version'; end if;
    insert into coach_recommendations (trainer_id, client_id, plan_id, version_id, prescribed_exercise_id, scope, type, severity, confidence, title, changes, rationale, data_points, uncertainty, checks, substitute_exercise_id, engine_version, fingerprint)
    values (t.trainer_id, t.client_id, t.id, t.current_version_id, nullif(it->>'prescribedId','')::uuid, it->>'scope', it->>'type', it->>'severity', it->>'confidence', it->>'title', it->'changes',
      array(select jsonb_array_elements_text(it->'rationale')), it->'data', array(select jsonb_array_elements_text(it->'uncertainty')), array(select jsonb_array_elements_text(it->'checks')),
      nullif(it->>'substituteExerciseId','')::uuid, it->>'engineVersion', it->>'fingerprint')
    on conflict (version_id, scope_key, fingerprint) do nothing;
    get diagnostics n = row_count; inserted := inserted + n;
    keys := keys || coalesce(nullif(it->>'prescribedId',''), 'client:' || (it->>'type'));
  end loop;
  -- pending proposals that the engine no longer produces (data changed) are superseded, never silently deleted
  update coach_recommendations c set status = 'superseded' where c.plan_id = t.id and c.version_id = t.current_version_id and c.status = 'pending'
    and not exists (select 1 from jsonb_array_elements(p_items) e where e->>'fingerprint' = c.fingerprint and coalesce(nullif(e->>'prescribedId',''), 'client:' || (e->>'type')) = c.scope_key);
  get diagnostics superseded = row_count;
  return jsonb_build_object('inserted', inserted, 'superseded', superseded);
end $$;

create function decide_recommendation(p_rec uuid, p_decision text, p_reason text default null, p_changes jsonb default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare r coach_recommendations; t training_plans; draft uuid; eff jsonb; ch jsonb; src_s plan_sessions; src_pe prescribed_exercises; dst_s uuid; dst_pe uuid; new_ex uuid; val text;
        sets_pct numeric := 40; load_pct numeric := 10; applied boolean := false;
begin
  if p_decision not in ('accepted','modified','rejected') then raise exception 'invalid decision'; end if;
  select * into r from coach_recommendations where id = p_rec for update;
  if r.id is null or r.trainer_id is distinct from auth.uid() or not trainer_has_access(auth.uid()) then raise exception 'not allowed'; end if;
  if r.status <> 'pending' then raise exception 'recommendation already resolved'; end if;
  select * into t from training_plans where id = r.plan_id;
  if t.current_version_id is distinct from r.version_id then update coach_recommendations set status = 'stale' where id = r.id; raise exception 'recommendation is stale: the plan changed after it was generated'; end if;
  if p_decision <> 'accepted' and length(trim(coalesce(p_reason,''))) < 5 then raise exception 'a reason of at least 5 characters is required'; end if;
  if p_decision = 'modified' and p_changes is null then raise exception 'modified decisions need the new values'; end if;

  if p_decision = 'rejected' then
    insert into recommendation_decisions (recommendation_id, decided_by, decision, reason, original_changes) values (r.id, auth.uid(), 'rejected', trim(p_reason), r.changes);
    update coach_recommendations set status = 'rejected' where id = r.id;
    return jsonb_build_object('status','rejected');
  end if;

  eff := case when p_decision = 'modified' then p_changes else r.changes end;
  if r.type not in ('request_reassessment','review_technique','maintain') then
    select id into draft from plan_versions where plan_id = t.id and status = 'draft';
    if draft is null then draft := new_draft_version(t.id, left('Propuesta de progresión: ' || r.title, 300)); end if;
    applied := true;
  end if;

  if r.type = 'deload' then
    for ch in select * from jsonb_array_elements(eff) loop
      if ch->>'field' = 'sets_reduction_pct' then sets_pct := (ch->>'to')::numeric; end if;
      if ch->>'field' = 'load_reduction_pct' then load_pct := (ch->>'to')::numeric; end if;
    end loop;
    if sets_pct not between 0 and 80 or load_pct not between 0 and 50 then raise exception 'deload percentages out of range'; end if;
    update prescribed_exercises pe set sets = greatest(1, round(pe.sets * (1 - sets_pct / 100.0))::int), load_kg = case when pe.load_kg is null then null else round(pe.load_kg * (1 - load_pct / 100.0) * 2) / 2 end
      where pe.session_id in (select id from plan_sessions where version_id = draft);
  elsif r.scope = 'exercise' and applied then
    select * into src_pe from prescribed_exercises where id = r.prescribed_exercise_id;
    select * into src_s from plan_sessions where id = src_pe.session_id;
    select s.id into dst_s from plan_sessions s where s.version_id = draft and s.position = src_s.position;
    select pe.id into dst_pe from prescribed_exercises pe where pe.session_id = dst_s and pe.position = src_pe.position and pe.exercise_id = src_pe.exercise_id;
    if dst_pe is null then raise exception 'the draft no longer matches this exercise; apply the change manually'; end if;
    for ch in select * from jsonb_array_elements(eff) loop
      val := ch->>'to';
      case ch->>'field'
        when 'sets' then update prescribed_exercises set sets = val::smallint where id = dst_pe;
        when 'reps_min' then update prescribed_exercises set reps_min = val::smallint where id = dst_pe;
        when 'reps_max' then update prescribed_exercises set reps_max = val::smallint where id = dst_pe;
        when 'load_kg' then update prescribed_exercises set load_kg = val::numeric where id = dst_pe;
        when 'rest_sec' then update prescribed_exercises set rest_sec = val::int where id = dst_pe;
        when 'exercise_id' then
          new_ex := coalesce(nullif(ch->>'to_id','')::uuid, r.substitute_exercise_id);
          if new_ex is null or not exists (select 1 from exercises e where e.id = new_ex and (e.owner_id is null or e.owner_id = auth.uid())) then raise exception 'invalid substitute exercise'; end if;
          update prescribed_exercises set exercise_id = new_ex, alternative_exercise_id = null where id = dst_pe;
        else raise exception 'field % cannot be applied automatically', ch->>'field';
      end case;
    end loop;
  end if;

  insert into recommendation_decisions (recommendation_id, decided_by, decision, reason, original_changes, applied_changes, applied_version_id)
    values (r.id, auth.uid(), p_decision, nullif(trim(coalesce(p_reason,'')), ''), r.changes, eff, draft);
  update coach_recommendations set status = p_decision where id = r.id;
  return jsonb_build_object('status', p_decision, 'draft_version_id', draft);
end $$;

revoke execute on function save_recommendations(uuid, jsonb), decide_recommendation(uuid, text, text, jsonb) from public, anon;
grant execute on function save_recommendations(uuid, jsonb), decide_recommendation(uuid, text, text, jsonb) to authenticated;

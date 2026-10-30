-- ===== helpers ==========================================================================
create function has_consent(u uuid, t consent_type) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from consents where user_id = u and type = t and revoked_at is null);
$$;

-- Who may see a client's progress photos: the client, or their active trainer (workspace valid)
-- while the client keeps BOTH the photos and the share-with-trainer consents.
create function photo_access(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() = c or (
    has_consent(c, 'photos') and has_consent(c, 'share_with_trainer') and exists (
      select 1 from trainer_client_relationships r where r.trainer_id = auth.uid() and r.client_id = c and r.status = 'active' and trainer_has_access(auth.uid())));
$$;

-- consents: a client can grant (insert) their own consents; revoke/regrant by update (policy already exists)
create policy consents_insert on consents for insert with check (user_id = auth.uid());

-- ===== private bucket + storage policies ==================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 6291456, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 6291456, allowed_mime_types = excluded.allowed_mime_types;

create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text and has_consent(auth.uid(), 'photos'));
create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and photo_access(((storage.foldername(name))[1])::uuid));
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===== tables ============================================================================
create table progress_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  taken_on date not null check (taken_on <= current_date + 1),
  pose text not null check (pose in ('front','side','back','other')),
  storage_path text not null unique check (storage_path like client_id::text || '/%'),
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  size_bytes int not null check (size_bytes between 1 and 6291456),
  notes text check (length(notes) <= 300),
  created_at timestamptz not null default now()
);
create index on progress_photos (client_id, taken_on desc);
alter table progress_photos enable row level security;
create policy pp_select on progress_photos for select using (photo_access(client_id));
create policy pp_insert on progress_photos for insert with check (client_id = auth.uid() and has_consent(auth.uid(), 'photos'));
create policy pp_delete on progress_photos for delete using (client_id = auth.uid());

create table photo_reviews (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references progress_photos(id) on delete cascade,
  trainer_id uuid not null references profiles(id),
  comment text check (length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique (photo_id, trainer_id)
);
alter table photo_reviews enable row level security;
create policy pr_select on photo_reviews for select using (trainer_id = auth.uid() or exists (select 1 from progress_photos p where p.id = photo_id and p.client_id = auth.uid()));
create policy pr_insert on photo_reviews for insert with check (trainer_id = auth.uid() and exists (select 1 from progress_photos p where p.id = photo_id and photo_access(p.client_id) and p.client_id <> auth.uid()));

create table photo_schedules (
  client_id uuid primary key references profiles(id) on delete cascade,
  trainer_id uuid not null references profiles(id),
  kind text not null check (kind in ('biweekly','four_weeks','six_weeks','monthly','custom')),
  custom_days int check (custom_days between 7 and 120),
  anchor_on date not null default current_date,
  updated_at timestamptz not null default now(),
  check ((kind = 'custom') = (custom_days is not null))
);
alter table photo_schedules enable row level security;
create policy ps_trainer on photo_schedules for all using (trainer_id = auth.uid() and trainer_has_access(auth.uid()) and exists (select 1 from trainer_client_relationships r where r.trainer_id = auth.uid() and r.client_id = photo_schedules.client_id and r.status = 'active'))
  with check (trainer_id = auth.uid() and exists (select 1 from trainer_client_relationships r where r.trainer_id = auth.uid() and r.client_id = photo_schedules.client_id and r.status = 'active'));
create policy ps_client on photo_schedules for select using (client_id = auth.uid());

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);
create index on notifications (user_id, created_at desc);
alter table notifications enable row level security;
create policy n_select on notifications for select using (user_id = auth.uid());
create policy n_update on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create table progress_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  generated_by uuid not null references profiles(id),
  period_start date not null, period_end date not null check (period_end >= period_start),
  observations text check (length(observations) <= 3000),
  next_goals text check (length(next_goals) <= 2000),
  summary jsonb not null,
  created_at timestamptz not null default now()
);
alter table progress_reports enable row level security;
create policy rp_select on progress_reports for select using (generated_by = auth.uid() and can_access_client(client_id));
create policy rp_insert on progress_reports for insert with check (generated_by = auth.uid() and can_access_client(client_id));

-- minimal, non-identifying trace that an erasure happened (no profile FK on purpose)
create table erasure_log (
  id uuid primary key default gen_random_uuid(),
  subject_hash text not null,
  role text not null,
  kind text not null check (kind in ('client_erasure','trainer_closure')),
  requested_at timestamptz not null default now(),
  detail jsonb not null default '{}'
);
alter table erasure_log enable row level security;   -- no policies: service role only

-- ===== due dates + reminders ==============================================================
create function photo_due_on(c uuid) returns date language sql stable security definer set search_path = public as $$
  select case s.kind when 'monthly' then (coalesce((select max(taken_on) from progress_photos where client_id = c), s.anchor_on) + interval '1 month')::date
    else coalesce((select max(taken_on) from progress_photos where client_id = c), s.anchor_on) + case s.kind when 'biweekly' then 14 when 'four_weeks' then 28 when 'six_weeks' then 42 else s.custom_days end end
  from photo_schedules s where s.client_id = c;
$$;

-- Reminders go out ONLY with the client's explicit 'communications' consent. Idempotent via dedupe_key.
create function generate_reminders() returns jsonb language plpgsql security definer set search_path = public as $$
declare a int := 0; b int := 0; c int := 0; n int;
begin
  insert into notifications (user_id, kind, title, body, link, dedupe_key)
  select s.client_id, 'photo_due', 'Toca tu foto de progreso', 'Tu entrenador configuró fotos periódicas. Súbela cuando puedas; puedes retirar este recordatorio desde Privacidad.', '/client/photos', 'photo_due:' || photo_due_on(s.client_id)
  from photo_schedules s
  join trainer_client_relationships r on r.client_id = s.client_id and r.trainer_id = s.trainer_id and r.status = 'active'
  where photo_due_on(s.client_id) <= current_date and has_consent(s.client_id, 'communications') and has_consent(s.client_id, 'photos')
    and exists (select 1 from trainer_subscriptions ts where ts.trainer_id = s.trainer_id and ((ts.status = 'trialing' and ts.trial_ends_at > now()) or (ts.status in ('active','past_due','canceled') and ts.current_period_end > now())))
  on conflict do nothing; get diagnostics a = row_count;
  insert into notifications (user_id, kind, title, body, link, dedupe_key)
  select r.trainer_id, 'photo_review', 'Foto de progreso pendiente de revisión', null, '/trainer/clients/' || p.client_id || '#fotos', 'photo_review:' || p.id
  from progress_photos p join trainer_client_relationships r on r.client_id = p.client_id and r.status = 'active'
  where not exists (select 1 from photo_reviews v where v.photo_id = p.id) and has_consent(p.client_id, 'photos') and has_consent(p.client_id, 'share_with_trainer')
  on conflict do nothing; get diagnostics b = row_count;
  insert into notifications (user_id, kind, title, body, link, dedupe_key)
  select ts.trainer_id, 'trial_ending', 'Tu prueba gratuita termina pronto', 'Termina el ' || to_char(ts.trial_ends_at at time zone 'America/Bogota', 'DD/MM/YYYY') || '. Suscríbete para conservar el acceso; tus datos se conservan de todos modos.', '/trainer/billing', 'trial_ending:' || ts.trial_ends_at::date
  from trainer_subscriptions ts where ts.status = 'trialing' and ts.trial_ends_at > now() and ts.trial_ends_at <= now() + interval '2 days'
  on conflict do nothing; get diagnostics c = row_count;
  return jsonb_build_object('photo_due', a, 'photo_review', b, 'trial_ending', c);
end $$;

-- ===== erasure bypass for immutability guards (only inside the SECURITY DEFINER erasure functions) ======
create or replace function guard_log_update() returns trigger language plpgsql as $$
begin
  if old.status <> 'in_progress' then raise exception 'finished workouts are immutable'; end if;
  if current_user in ('authenticated','anon') and (new.client_id <> old.client_id or new.plan_id <> old.plan_id or new.version_id <> old.version_id or new.session_id <> old.session_id or new.started_at <> old.started_at or new.planned_sets is distinct from old.planned_sets or new.logged_work_sets is distinct from old.logged_work_sets) then
    raise exception 'immutable fields'; end if;
  return new;
end $$;
create or replace function erasure_active() returns boolean language sql stable as $$
  select coalesce(current_setting('app.erasure', true), '') = 'on' and current_user not in ('authenticated','anon');
$$;
create or replace function guard_log_children() returns trigger language plpgsql security definer set search_path = public as $$
declare st record; sid uuid;
begin
  if tg_op = 'DELETE' and erasure_active() then return old; end if;
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
create or replace function guard_published_children() returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if tg_op = 'DELETE' and erasure_active() then return old; end if;
  if tg_table_name = 'plan_sessions' then v := coalesce(new.version_id, old.version_id);
  else v := session_version(coalesce(new.session_id, old.session_id)); end if;
  if v is not null and version_is_published(v) then raise exception 'published plan versions are immutable; create a new version'; end if;
  return coalesce(new, old);
end $$;
create or replace function guard_version_delete() returns trigger language plpgsql as $$
begin
  if erasure_active() then return old; end if;
  if old.status = 'published' and exists (select 1 from training_plans where id = old.plan_id) then raise exception 'published versions cannot be deleted'; end if;
  return old;
end $$;

create function erase_client(p_client uuid) returns jsonb language plpgsql security definer set search_path = public as $$
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

create function close_trainer_account(p_trainer uuid) returns jsonb language plpgsql security definer set search_path = public as $$
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

revoke execute on function generate_reminders(), erase_client(uuid), close_trainer_account(uuid) from public, anon, authenticated;
grant execute on function generate_reminders(), erase_client(uuid), close_trainer_account(uuid) to service_role;

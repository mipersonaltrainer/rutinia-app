-- Access to a client's health/body data: the client, or their active trainer who has
-- workspace access AND whose client has granted both consents (not revoked).
create function can_access_client(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() = c or exists (
    select 1 from trainer_client_relationships r
    where r.trainer_id = auth.uid() and r.client_id = c and r.status = 'active'
      and trainer_has_access(auth.uid())
      and (select count(*) from consents k where k.user_id = c and k.revoked_at is null
           and k.type in ('health_data','share_with_trainer')) = 2);
$$;

create type assessment_status as enum ('draft','submitted');
create table assessments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'initial' check (kind in ('initial','reassessment')),
  status assessment_status not null default 'draft',
  data jsonb not null default '{}',           -- sections: personal, training, goals, health, habits
  risk_level text check (risk_level in ('none','review','professional_evaluation')),
  risk_reasons text[] not null default '{}',  -- computed server-side by deterministic rules
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on assessments (client_id, created_at desc);

create table anthropometric_measurements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5,1) check (weight_kg between 20 and 400),
  height_cm numeric(5,1) check (height_cm between 100 and 250),
  waist_cm numeric(5,1) check (waist_cm between 30 and 250),
  hip_cm numeric(5,1) check (hip_cm between 40 and 250),
  neck_cm numeric(4,1) check (neck_cm between 15 and 80),
  arm_cm numeric(4,1) check (arm_cm between 10 and 80),
  thigh_cm numeric(4,1) check (thigh_cm between 20 and 120),
  calf_cm numeric(4,1) check (calf_cm between 15 and 80),
  method text not null check (method in ('tape','scale','bioimpedance','other')),
  taken_by text not null check (taken_by in ('self','trainer','device')),
  entered_by uuid not null references profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  check (num_nonnulls(weight_kg,height_cm,waist_cm,hip_cm,neck_cm,arm_cm,thigh_cm,calf_cm) >= 1)
);
create index on anthropometric_measurements (client_id, measured_on desc);

create table calculation_results (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  measurement_id uuid not null references anthropometric_measurements(id) on delete cascade,
  indicator text not null,
  value numeric not null,
  unit text not null,
  formula text not null,
  formula_version text not null,
  provenance text not null check (provenance in ('estimated','measured','declared')),
  inputs jsonb not null,
  created_at timestamptz not null default now(),
  unique (measurement_id, indicator)
);

create table access_audit (
  id bigserial primary key,
  actor_id uuid not null references profiles(id),
  client_id uuid not null references profiles(id),
  resource text not null,
  at timestamptz not null default now()
);

alter table assessments enable row level security;
alter table anthropometric_measurements enable row level security;
alter table calculation_results enable row level security;
alter table access_audit enable row level security;

create policy as_read on assessments for select using (can_access_client(client_id));
create policy as_insert on assessments for insert with check (client_id = auth.uid());
create policy as_update on assessments for update using (client_id = auth.uid() and status = 'draft') with check (client_id = auth.uid());
create policy me_read on anthropometric_measurements for select using (can_access_client(client_id));
create policy me_insert on anthropometric_measurements for insert with check (can_access_client(client_id) and entered_by = auth.uid());
create policy cr_read on calculation_results for select using (can_access_client(client_id));
create policy cr_insert on calculation_results for insert with check (can_access_client(client_id));
create policy audit_read on access_audit for select using (client_id = auth.uid());
-- measurements and results are append-only for users (no update/delete policies); access_audit is written by the server only.

create extension if not exists unaccent;
create function immutable_unaccent(t text) returns text language sql immutable as $$ select public.unaccent('public.unaccent', t) $$;

create table exercises (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  owner_id uuid references profiles(id) on delete cascade,          -- null = global library
  name_es text not null,
  alt_names text[] not null default '{}',
  primary_muscle text not null,
  secondary_muscles text[] not null default '{}',
  movement_pattern text not null,
  exercise_type text not null check (exercise_type in ('strength','power','cardio','mobility','stability','isometric')),
  equipment text not null,
  difficulty text not null check (difficulty in ('beginner','intermediate','advanced')),
  requirements text[] not null default '{}',
  instructions text[] not null default '{}',
  common_errors text[] not null default '{}',
  safety_notes text[] not null default '{}',
  joint_stress text[] not null default '{}',
  goals text[] not null default '{}',
  tags text[] not null default '{}',
  home_friendly boolean not null default false,
  source text not null,
  review_status text not null default 'draft' check (review_status in ('draft','reviewed')),
  media_status text not null default 'pending' check (media_status in ('pending','available')),
  search_text text not null default '',
  created_at timestamptz not null default now()
);
create unique index exercises_global_slug on exercises (slug) where owner_id is null;
create unique index exercises_owner_slug on exercises (owner_id, slug) where owner_id is not null;
create unique index exercises_global_name on exercises (lower(name_es)) where owner_id is null;
create index exercises_filters on exercises (primary_muscle, equipment, difficulty, movement_pattern);
create index exercises_search on exercises using gin (to_tsvector('simple', search_text));

create function exercises_search_text() returns trigger language plpgsql as $$
begin
  new.search_text := lower(immutable_unaccent(new.name_es || ' ' || array_to_string(new.alt_names,' ') || ' ' || array_to_string(new.tags,' ')));
  return new;
end $$;
create trigger trg_exercises_search before insert or update on exercises for each row execute function exercises_search_text();

create table exercise_relations (
  exercise_id uuid not null references exercises(id) on delete cascade,
  related_id uuid not null references exercises(id) on delete cascade,
  kind text not null check (kind in ('regression','progression','alternative','variant')),
  primary key (exercise_id, related_id, kind),
  check (exercise_id <> related_id)
);

create table exercise_media (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references exercises(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('video','image')),
  url text not null check (url ~ '^https://'),
  provenance text not null check (length(provenance) >= 3),       -- who made it / license: required
  created_at timestamptz not null default now()
);

alter table exercises enable row level security;
alter table exercise_relations enable row level security;
alter table exercise_media enable row level security;

create policy ex_read on exercises for select to authenticated using (
  owner_id is null or owner_id = auth.uid()
  or exists (select 1 from trainer_client_relationships r where r.trainer_id = exercises.owner_id and r.client_id = auth.uid() and r.status = 'active'));
create policy ex_write on exercises for insert to authenticated with check (owner_id = auth.uid() and trainer_has_access(auth.uid()));
create policy ex_update on exercises for update to authenticated using (owner_id = auth.uid() and trainer_has_access(auth.uid())) with check (owner_id = auth.uid());
create policy ex_delete on exercises for delete to authenticated using (owner_id = auth.uid() and trainer_has_access(auth.uid()));
create policy rel_read on exercise_relations for select to authenticated using (exists (select 1 from exercises e where e.id = exercise_id));
create policy media_read on exercise_media for select to authenticated using (exists (select 1 from exercises e where e.id = exercise_id));
create policy media_write on exercise_media for insert to authenticated with check (owner_id = auth.uid() and trainer_has_access(auth.uid())
  and exists (select 1 from exercises e where e.id = exercise_id and e.owner_id = auth.uid()));
create policy media_delete on exercise_media for delete to authenticated using (owner_id = auth.uid());
-- Global rows (owner_id null) and their relations are written only by the service role (seed script).

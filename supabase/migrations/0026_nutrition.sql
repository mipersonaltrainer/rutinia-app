-- Nutrition module.
--  * The trainer decides, per client, whether that client has a nutrition section at all (trainer_client_relationships.nutrition_enabled, default off).
--  * foods: a global reference library (owner_id null, read-only) plus the trainer's own foods. Values are per 100 g; `measures` maps a
--    household unit (cucharada, pocillo, vaso…) to grams for THAT food, because a spoon of rice and a spoon of oil weigh differently.
--  * nutrition_plans → nutrition_meals → nutrition_items (grams are the canonical quantity; household units are derived for display).
--  * Same privacy model as training data: the trainer reaches a client's plan only while the workspace is valid and the client keeps
--    the health-data and share-with-trainer consents; the client sees only PUBLISHED plans, and only while the trainer keeps the section on.

alter table trainer_client_relationships add column nutrition_enabled boolean not null default false;

create function set_client_nutrition(p_client uuid, p_enabled boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not trainer_has_access(auth.uid()) then raise exception 'workspace not active'; end if;
  update trainer_client_relationships set nutrition_enabled = p_enabled
    where trainer_id = auth.uid() and client_id = p_client and status = 'active';
  if not found then raise exception 'client not found'; end if;
end $$;

create table foods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete cascade,            -- null = global library
  slug text not null check (slug ~ '^[a-z0-9-]{2,80}$'),
  name_es text not null check (length(btrim(name_es)) between 2 and 120),
  category text not null check (category in ('cereales_tuberculos','verduras','frutas','lacteos','carnes_huevos_pescado','leguminosas','grasas_frutos_secos','azucares_dulces','bebidas','preparados','otros')),
  kcal_100 numeric(6,1) not null check (kcal_100 between 0 and 900),
  protein_100 numeric(5,1) not null check (protein_100 between 0 and 100),
  carbs_100 numeric(5,1) not null check (carbs_100 between 0 and 100),
  fat_100 numeric(5,1) not null check (fat_100 between 0 and 100),
  fiber_100 numeric(5,1) check (fiber_100 between 0 and 100),
  is_liquid boolean not null default false,
  measures jsonb not null default '{}',                                -- { "cucharada": 15, "vaso": 240, … } grams per household unit
  review_status text not null default 'draft' check (review_status in ('draft','reviewed')),
  created_at timestamptz not null default now()
);
create unique index foods_global_slug on foods (slug) where owner_id is null;
create unique index foods_owner_slug on foods (owner_id, slug) where owner_id is not null;
alter table foods enable row level security;
create policy foods_read on foods for select to authenticated using (owner_id is null or owner_id = auth.uid());
create policy foods_ins on foods for insert to authenticated with check (owner_id = auth.uid() and trainer_has_access(auth.uid()));
create policy foods_upd on foods for update to authenticated using (owner_id = auth.uid() and trainer_has_access(auth.uid())) with check (owner_id = auth.uid());
create policy foods_del on foods for delete to authenticated using (owner_id = auth.uid() and trainer_has_access(auth.uid()));

create table nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references profiles(id),
  client_id uuid not null references profiles(id) on delete cascade,
  title text not null check (length(btrim(title)) between 2 and 120),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  kcal_target int check (kcal_target between 800 and 6000),
  protein_g int check (protein_g between 0 and 600), carbs_g int check (carbs_g between 0 and 1000), fat_g int check (fat_g between 0 and 400),
  notes text check (length(notes) <= 2000),
  ai_generated boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), published_at timestamptz
);
create index on nutrition_plans (client_id, status);
create unique index one_published_nutrition_plan on nutrition_plans (client_id) where status = 'published';

create table nutrition_meals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references nutrition_plans(id) on delete cascade,
  position smallint not null check (position between 1 and 12),
  name text not null check (length(btrim(name)) between 1 and 60),
  note text check (length(note) <= 300),
  unique (plan_id, position)
);
create table nutrition_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references nutrition_meals(id) on delete cascade,
  food_id uuid not null references foods(id),
  grams numeric(7,1) not null check (grams > 0 and grams <= 3000),
  note text check (length(note) <= 200),
  created_at timestamptz not null default now()
);
create index on nutrition_items (meal_id);

create function nutrition_trainer_ok(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from nutrition_plans n where n.id = p and n.trainer_id = auth.uid() and trainer_has_access(auth.uid()) and can_access_client(n.client_id));
$$;
create function nutrition_client_ok(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from nutrition_plans n join trainer_client_relationships r on r.trainer_id = n.trainer_id and r.client_id = n.client_id
    where n.id = p and n.client_id = auth.uid() and n.status = 'published' and r.status = 'active' and r.nutrition_enabled and trainer_has_access(n.trainer_id));
$$;
create function nutrition_can_create(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and trainer_has_access(auth.uid()) and can_access_client(c) and exists (
    select 1 from trainer_client_relationships r where r.trainer_id = auth.uid() and r.client_id = c and r.status = 'active' and r.nutrition_enabled);
$$;
create function meal_plan(m uuid) returns uuid language sql stable security definer set search_path = public as $$ select plan_id from nutrition_meals where id = m; $$;

alter table nutrition_plans enable row level security; alter table nutrition_meals enable row level security; alter table nutrition_items enable row level security;
-- inline (not through a function that re-reads the table): INSERT … RETURNING must be able to see the row it just created
create policy np_trainer_sel on nutrition_plans for select using (trainer_id = auth.uid() and trainer_has_access(auth.uid()) and can_access_client(client_id));
create policy np_client_sel on nutrition_plans for select using (nutrition_client_ok(id));
create policy np_ins on nutrition_plans for insert with check (trainer_id = auth.uid() and nutrition_can_create(client_id));
create policy np_upd on nutrition_plans for update using (nutrition_trainer_ok(id)) with check (trainer_id = auth.uid());
create policy np_del on nutrition_plans for delete using (nutrition_trainer_ok(id) and status = 'draft');
create policy nm_sel on nutrition_meals for select using (nutrition_trainer_ok(plan_id) or nutrition_client_ok(plan_id));
create policy nm_write on nutrition_meals for all using (nutrition_trainer_ok(plan_id)) with check (nutrition_trainer_ok(plan_id));
create policy ni_sel on nutrition_items for select using (nutrition_trainer_ok(meal_plan(meal_id)) or nutrition_client_ok(meal_plan(meal_id)));
create policy ni_write on nutrition_items for all using (nutrition_trainer_ok(meal_plan(meal_id))) with check (nutrition_trainer_ok(meal_plan(meal_id)));

create function touch_plan_from_meal() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then update nutrition_plans set updated_at = now() where id = old.plan_id; else update nutrition_plans set updated_at = now() where id = new.plan_id; end if;
  return null;
end $$;
create function touch_plan_from_item() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then update nutrition_plans set updated_at = now() where id = meal_plan(old.meal_id); else update nutrition_plans set updated_at = now() where id = meal_plan(new.meal_id); end if;
  return null;
end $$;
create trigger trg_touch_meals after insert or update or delete on nutrition_meals for each row execute function touch_plan_from_meal();
create trigger trg_touch_items after insert or update or delete on nutrition_items for each row execute function touch_plan_from_item();

-- Signed-in users call these (directly or through RLS); anonymous callers never.
revoke execute on function set_client_nutrition(uuid, boolean), nutrition_trainer_ok(uuid), nutrition_client_ok(uuid), nutrition_can_create(uuid), meal_plan(uuid), touch_plan_from_meal(), touch_plan_from_item() from public, anon;
grant execute on function set_client_nutrition(uuid, boolean), nutrition_trainer_ok(uuid), nutrition_client_ok(uuid), nutrition_can_create(uuid), meal_plan(uuid) to authenticated;

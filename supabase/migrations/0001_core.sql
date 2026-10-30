-- Rutinia core schema. Money = integer minor units. RLS on every table.
create extension if not exists pgcrypto;

create type user_role as enum ('trainer','client');
create type relationship_status as enum ('active','archived');
create type invitation_status as enum ('pending','accepted','expired','revoked');
create type subscription_status as enum ('trialing','active','payment_required','past_due','suspended','canceled','expired');
create type payment_status as enum ('pending','approved','declined','voided','expired');
create type payment_provider as enum ('paypal','wompi');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table trainer_client_relationships (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references profiles(id),
  client_id uuid not null references profiles(id),
  status relationship_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (trainer_id, client_id)            -- no duplicate relationships
);
create index on trainer_client_relationships (trainer_id, status);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references profiles(id),
  email text not null,
  token_hash text not null unique,
  status invitation_status not null default 'pending',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table trainer_subscriptions (
  trainer_id uuid primary key references profiles(id),
  status subscription_status not null default 'trialing',
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '7 days'),  -- server time only
  provider payment_provider,
  provider_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table slot_purchases (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references profiles(id),
  provider payment_provider not null,
  provider_reference text not null,
  quantity int not null check (quantity between 1 and 10),
  unit_price_cents int not null check (unit_price_cents = 75),
  total_cents int not null check (total_cents = quantity * unit_price_cents),
  currency text not null default 'USD',
  charged_amount_cents bigint,
  charged_currency text,
  fx_rate numeric, fx_rate_at timestamptz,
  status payment_status not null default 'pending',
  slots_granted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (provider, provider_reference)      -- idempotency
);

create table provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider payment_provider not null,
  event_id text not null,
  payload jsonb not null,
  processed_at timestamptz,
  received_at timestamptz not null default now(),
  unique (provider, event_id)                -- duplicate webhooks rejected
);

create table billing_audit_events (
  id bigserial primary key,
  trainer_id uuid references profiles(id),
  kind text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Capacity is authoritative in the DB, never from the browser.
create function trainer_capacity(t uuid) returns int language sql stable security definer as $$
  select 20 + coalesce(sum(quantity),0)::int from slot_purchases
  where trainer_id = t and status = 'approved' and slots_granted;
$$;

create function enforce_client_capacity() returns trigger language plpgsql security definer as $$
declare active_count int;
begin
  if new.status = 'active' then
    select count(*) into active_count from trainer_client_relationships
      where trainer_id = new.trainer_id and status = 'active' and id is distinct from new.id;
    if active_count >= trainer_capacity(new.trainer_id) then
      raise exception 'client capacity exceeded';
    end if;
  end if;
  return new;
end $$;
create trigger trg_capacity before insert or update on trainer_client_relationships
  for each row execute function enforce_client_capacity();

-- Workspace is usable only while trialing (unexpired) or active.
create function trainer_has_access(t uuid) returns boolean language sql stable security definer as $$
  select exists (select 1 from trainer_subscriptions s where s.trainer_id = t and
    ((s.status = 'trialing' and s.trial_ends_at > now()) or s.status = 'active'));
$$;

alter table profiles enable row level security;
alter table trainer_client_relationships enable row level security;
alter table invitations enable row level security;
alter table trainer_subscriptions enable row level security;
alter table slot_purchases enable row level security;
alter table provider_webhook_events enable row level security;
alter table billing_audit_events enable row level security;

create policy profiles_self on profiles for select using (id = auth.uid()
  or exists (select 1 from trainer_client_relationships r where r.trainer_id = auth.uid() and r.client_id = profiles.id));
create policy profiles_update_self on profiles for update using (id = auth.uid());
create policy rel_trainer on trainer_client_relationships for select using (trainer_id = auth.uid() or client_id = auth.uid());
create policy rel_trainer_write on trainer_client_relationships for all
  using (trainer_id = auth.uid() and trainer_has_access(auth.uid()))
  with check (trainer_id = auth.uid() and trainer_has_access(auth.uid()));
create policy inv_trainer on invitations for all
  using (trainer_id = auth.uid() and trainer_has_access(auth.uid()))
  with check (trainer_id = auth.uid() and trainer_has_access(auth.uid()));
create policy sub_owner on trainer_subscriptions for select using (trainer_id = auth.uid());
create policy slots_owner on slot_purchases for select using (trainer_id = auth.uid());
-- No client write policies on subscriptions, purchases, webhooks or audit: only the service role (server) writes them.

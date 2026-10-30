-- Marketing for the platform's own customers (trainers): campaigns, announcements and birthday greetings, through the app (notifications),
-- web push and e-mail. Operated from the support panel (/staff/marketing). Everything the panel touches is service-role only: RLS is on and
-- there is deliberately no policy, so nothing here is readable or writable through the API by a trainer.

-- ===== who they are, and what they accept ====================================================================================
alter table profiles add column birth_date date check (birth_date is null or birth_date between date '1900-01-01' and date '2100-01-01');
alter table profiles add column marketing_in_app boolean not null default true;     -- news and campaigns in the notification bell
alter table profiles add column marketing_email boolean not null default true;      -- news and campaigns by e-mail (push is opt-in: it exists only if they subscribed)

-- The sign-up form may carry the birth date (optional). Anything unusable is dropped silently: signing up must never fail because of it.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare r user_role := coalesce((new.raw_app_meta_data->>'role')::user_role, 'trainer'); bd date;
begin
  begin bd := nullif(new.raw_user_meta_data->>'birth_date', '')::date; exception when others then bd := null; end;
  if bd is not null and (bd > current_date - interval '16 years' or bd < date '1900-01-01') then bd := null; end if;
  insert into profiles (id, role, full_name, birth_date)
    values (new.id, r, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), case when r = 'trainer' then bd else null end);
  if r = 'trainer' then
    insert into trainer_subscriptions (trainer_id) values (new.id);  -- 7-day trial from server clock
  end if;
  return new;
end $$;

-- A student's account is created as a trainer's and then converted by sync_client_role(): that conversion must also drop the birth date.
create or replace function sync_client_role() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.raw_app_meta_data->>'role' = 'client' then
    update profiles set role = 'client', birth_date = null where id = new.id and role = 'trainer';
    delete from trainer_subscriptions where trainer_id = new.id
      and not exists (select 1 from trainer_client_relationships r where r.trainer_id = new.id);
  end if;
  return new;
end $$;

-- ===== web push ==============================================================================================================
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 8 and 100),
  user_agent text check (user_agent is null or length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index on push_subscriptions (user_id);
alter table push_subscriptions enable row level security;
create policy ps_select_own on push_subscriptions for select using (user_id = auth.uid());
create policy ps_delete_own on push_subscriptions for delete using (user_id = auth.uid());
-- No INSERT/UPDATE policy: saving goes through the function, which also moves a browser that changes account (the endpoint is unique per browser).
create function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text default null) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if (select role from profiles where id = me) is distinct from 'trainer' then raise exception 'forbidden'; end if;
  if (select count(*) from push_subscriptions where user_id = me) >= 10 and not exists (select 1 from push_subscriptions where endpoint = p_endpoint and user_id = me) then raise exception 'too many devices'; end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values (me, p_endpoint, p_p256dh, p_auth, left(p_ua, 300))
    on conflict (endpoint) do update set user_id = me, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end $$;

-- ===== campaigns =============================================================================================================
-- kind: 'comunicado' (service notice: in-app reaches everyone), 'campana' (promotion: respects opt-outs), 'cumple' (birthday greeting: respects opt-outs).
create table marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('comunicado', 'campana', 'cumple')),
  title text not null check (length(btrim(title)) between 3 and 80),
  body text not null check (length(btrim(body)) between 1 and 600),
  link text check (link is null or (length(link) <= 300 and link !~ '^//' and (link ~ '^/[A-Za-z0-9/_?=&%.#-]*$' or link ~ '^https://[^[:space:]]+$'))),   -- '//host' would leave the site
  channels text[] not null check (cardinality(channels) > 0 and channels <@ array['in_app', 'push', 'email']),
  audience text not null check (audience in ('todos', 'pagando', 'prueba', 'bloqueados', 'cumple_hoy', 'uno')),
  audience_user uuid references profiles(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'canceled', 'failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  stats jsonb not null default '{}',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (audience <> 'uno' or audience_user is not null)
);
create index on marketing_campaigns (status, scheduled_at);
create index on marketing_campaigns (created_at desc);

-- One row: the automatic birthday greeting (the cron sends it once a year per person; birthday_greetings is the memory that prevents repeats).
create table marketing_settings (
  id boolean primary key default true check (id),
  birthday_auto boolean not null default false,
  birthday_title text not null default '¡Feliz cumpleaños, {nombre}! 🎂' check (length(btrim(birthday_title)) between 3 and 80),
  birthday_body text not null default 'Todo el equipo de Rutinia te desea un día increíble. Gracias por entrenar con nosotros y por acompañar a tus alumnos.' check (length(btrim(birthday_body)) between 1 and 600),
  birthday_channels text[] not null default array['in_app'] check (cardinality(birthday_channels) > 0 and birthday_channels <@ array['in_app', 'push', 'email']),
  updated_at timestamptz not null default now()
);
insert into marketing_settings (id) values (true);
create table birthday_greetings (
  user_id uuid not null references profiles(id) on delete cascade,
  year integer not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, year)
);

alter table marketing_campaigns enable row level security;
alter table marketing_settings enable row level security;
alter table birthday_greetings enable row level security;
revoke all on marketing_campaigns, marketing_settings, birthday_greetings from anon, authenticated;

revoke all on function save_push_subscription(text, text, text, text) from public, anon;
grant execute on function save_push_subscription(text, text, text, text) to authenticated;

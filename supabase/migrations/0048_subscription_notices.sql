-- Memory of the service e-mails already sent about a subscription (trial ending, plan renewal), so the 15-minute cron never sends the same one twice.
-- One row per trainer, kind and period (the trial's end date, or the paid period's end date): a new period is a new notice.
-- Only the server (service role) reads or writes it.
create table subscription_notices (
  trainer_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('trial_ending', 'renewal_due')),
  period_key text not null check (length(period_key) between 1 and 40),
  sent_at timestamptz not null default now(),
  primary key (trainer_id, kind, period_key)
);
alter table subscription_notices enable row level security;
revoke all on subscription_notices from anon, authenticated;

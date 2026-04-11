create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  parent_plan_id uuid references plans(id) on delete set null,
  owner_role text,
  role_type text not null check (role_type in ('member', 'leader', 'squad', 'platoon', 'o1')),
  full_name text not null,
  start_date date,
  calendar_start_date date,
  target_pi integer not null default 0,
  target_sales numeric(12,2) not null default 0,
  info jsonb not null default '{}'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  status text not null default 'submitted' check (status in ('draft', 'submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plans add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table plans add column if not exists parent_plan_id uuid references plans(id) on delete set null;
alter table plans add column if not exists owner_role text;

create table if not exists plan_week_entries (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  week_number integer not null check (week_number between 1 and 12),
  activity_name text not null,
  activity_date date,
  leads integer not null default 0,
  attendees integer not null default 0,
  pay_ins integer not null default 0,
  sales numeric(12,2) not null default 0,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists plan_consolidation_entries (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  name text not null,
  role_label text not null default '',
  leads integer not null default 0,
  att integer not null default 0,
  pi integer not null default 0,
  sales numeric(12,2) not null default 0,
  evt integer not null default 0,
  pi_target integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists plans_role_type_idx on plans(role_type);
create index if not exists plans_user_id_idx on plans(user_id);
create index if not exists plans_parent_plan_id_idx on plans(parent_plan_id);
create index if not exists plan_week_entries_plan_week_idx on plan_week_entries(plan_id, week_number);
create index if not exists plan_consolidation_entries_plan_idx on plan_consolidation_entries(plan_id);

drop trigger if exists plans_set_updated_at on plans;
create trigger plans_set_updated_at
before update on plans
for each row
execute function set_updated_at();

alter table plans enable row level security;
alter table plan_week_entries enable row level security;
alter table plan_consolidation_entries enable row level security;

drop policy if exists users_manage_own_plans on plans;
create policy users_manage_own_plans
on plans
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists users_manage_own_plan_week_entries on plan_week_entries;
create policy users_manage_own_plan_week_entries
on plan_week_entries
for all
using (
  exists (
    select 1
    from plans
    where plans.id = plan_week_entries.plan_id
      and plans.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from plans
    where plans.id = plan_week_entries.plan_id
      and plans.user_id = auth.uid()
  )
);

drop policy if exists users_manage_own_plan_consolidation_entries on plan_consolidation_entries;
create policy users_manage_own_plan_consolidation_entries
on plan_consolidation_entries
for all
using (
  exists (
    select 1
    from plans
    where plans.id = plan_consolidation_entries.plan_id
      and plans.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from plans
    where plans.id = plan_consolidation_entries.plan_id
      and plans.user_id = auth.uid()
  )
);

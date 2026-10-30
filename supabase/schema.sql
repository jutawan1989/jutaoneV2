-- JutaOne.Biz — Phase 1 schema
-- Run in the Supabase SQL editor (region: ap-southeast-1 / Singapore).
-- All tables are written by the server with the service role key, so RLS is
-- enabled with no policies: anon and authenticated keys get no access.

create table if not exists public.demo_attempts (
  id bigserial primary key,
  visitor_key text not null,
  ip_hash text not null,
  device_hash text not null,
  locale text,
  region text,
  created_at timestamptz not null default now()
);

create index if not exists demo_attempts_visitor_key_idx on public.demo_attempts (visitor_key);
create index if not exists demo_attempts_device_hash_idx on public.demo_attempts (device_hash);

create table if not exists public.ai_usage (
  id bigserial primary key,
  day date not null,
  cost_usd numeric(12, 6) not null default 0,
  model text,
  locale text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_day_idx on public.ai_usage (day);

create table if not exists public.events (
  id bigserial primary key,
  name text not null,
  locale text,
  region text,
  variant text,
  utm jsonb not null default '{}'::jsonb,
  visitor_key text,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_name_idx on public.events (name);
create index if not exists events_created_at_idx on public.events (created_at);
create index if not exists events_variant_idx on public.events (variant);
create index if not exists events_locale_idx on public.events (locale);

create table if not exists public.topups (
  id bigserial primary key,
  provider text not null default 'chip',
  provider_id text not null unique,
  reference text,
  status text,
  amount bigint,
  currency text,
  -- RM-anchored FX (Boss spec): Chip settles `amount`/`currency` (e.g. IDR),
  -- while `base_amount` records the RM value in SEN (integer minor units,
  -- matching `amount`) and `fx_rate` the RM->IDR rate used at checkout.
  base_amount numeric,
  base_currency text,
  fx_rate numeric,
  created_at timestamptz not null default now()
);

alter table public.demo_attempts enable row level security;
alter table public.ai_usage enable row level security;
alter table public.events enable row level security;
alter table public.topups enable row level security;

-- Daily AI spend, single round trip (used by the kill switch).
create or replace function public.jutaone_daily_cost(target_day date)
returns numeric
language sql
stable
as $$
  select coalesce(sum(cost_usd), 0)::numeric from public.ai_usage where day = target_day;
$$;

-- Migration (idempotent): RM-anchored FX columns for existing `topups` tables.
alter table public.topups add column if not exists base_amount numeric;
alter table public.topups add column if not exists base_currency text;
alter table public.topups add column if not exists fx_rate numeric;

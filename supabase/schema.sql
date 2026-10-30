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
  -- while `base_amount` records the RM value in SEN as bigint integer minor
  -- units (matching `amount`) and `fx_rate` the RM->IDR rate used at checkout.
  -- bigint, never numeric: the vendor posts RM floats ("5.70") and a float
  -- reaching this column fails the upsert outright.
  base_amount bigint,
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
-- `base_amount` is bigint integer sen: older checkouts created it as numeric,
-- which let RM floats through to a column family the webhook treats as minor
-- units. Convert first, then enforce the type, so a re-run is a no-op.
alter table public.topups add column if not exists base_amount numeric;
do $$
begin
  -- Round any legacy RM decimals to whole sen, then lock the type. `USING`
  -- keeps existing integer values untouched.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'topups'
      and column_name = 'base_amount' and data_type = 'numeric'
  ) then
    update public.topups set base_amount = round(base_amount) where base_amount is not null;
    alter table public.topups alter column base_amount type bigint using base_amount::bigint;
  end if;
end $$;
alter table public.topups add column if not exists base_currency text;
alter table public.topups add column if not exists fx_rate numeric;

-- Cleanup (idempotent): drop the rogue `token_ledger` guard that rejects
-- gateway top-up credits ("a topup credit must reference a top-up"). It was
-- NEVER created by any file in this repo — it was added directly on the live
-- database, and it blocks every `reason = 'topup'` credit from both gateways
-- (Chip and ToyyibPay share the same insert shape: visitor_key, delta,
-- reason, spend_ref, tokens). The matcher covers both spellings ("top-up"
-- and "topup") so a re-worded variant cannot survive a future migration.
-- Only triggers whose function definition contains that phrase are dropped;
-- the balance / overdraw guard, the spend_ref uniqueness index and all
-- constraints are left untouched.
do $$
declare
  r record;
  fndef text;
begin
  for r in
    select t.tgname as tgname, t.tgfoid as fnoid
      from pg_trigger t
     where t.tgrelid = 'public.token_ledger'::regclass
       and not t.tgisinternal
  loop
    select pg_get_functiondef(r.fnoid) into fndef;
    if fndef ilike '%must reference a top-up%'
       or fndef ilike '%must reference a topup%' then
      execute format('drop trigger if exists %I on public.token_ledger', r.tgname);
      execute format('drop function if exists %s', r.fnoid::regprocedure);
    end if;
  end loop;
end $$;

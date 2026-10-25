-- JutaOne.Biz — FX rates for USD-based pricing
--
-- The commercial price is one USD ($1.00 = 1,000,000 tokens). Local amounts are
-- derived from an FX rate at request time, so a rate change costs one row update
-- instead of a code deploy.
--
-- Design notes:
--   * Rates are stored per currency, effective-dated, and the newest row that is
--     not in the future wins. Old rows are kept so a past top-up can always be
--     explained against the rate that was live when it happened.
--   * A rate must be positive. A zero or negative rate would produce a free or
--     negative charge at checkout, so it is rejected by the database rather than
--     trusted from the caller.
--   * `rate` is "units of local currency per 1 USD" (4.70 MYR, 16000 IDR).
--   * `base_price_usd_cents` is recorded on each top-up, so historical revenue
--     is readable in USD without reverse-engineering the FX rate.
--
-- Idempotent: safe to re-run, and the region move runs it again.

create table if not exists public.fx_rates (
  id bigserial primary key,
  currency text not null,
  rate numeric(18, 6) not null,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  note text,
  constraint fx_rates_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint fx_rates_rate_positive check (rate > 0)
);

create index if not exists fx_rates_currency_effective_idx
  on public.fx_rates (currency, effective_from desc);

-- One rate per currency per instant, so a duplicated insert cannot make the
-- "latest rate" ambiguous.
create unique index if not exists fx_rates_currency_effective_key
  on public.fx_rates (currency, effective_from);

-- ---------------------------------------------------------------------------
-- Latest rate per currency
-- ---------------------------------------------------------------------------

create or replace function public.jutaone_latest_fx_rate(target_currency text)
returns numeric
language sql
stable
as $$
  select r.rate
    from public.fx_rates r
   where r.currency = target_currency
     and r.effective_from <= now()
   order by r.effective_from desc
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Seed the rates the brief specified, only when no rate exists yet
-- ---------------------------------------------------------------------------

insert into public.fx_rates (currency, rate, note)
select 'MYR', 4.70, 'initial rate from the USD pricing brief'
where not exists (select 1 from public.fx_rates where currency = 'MYR');

insert into public.fx_rates (currency, rate, note)
select 'IDR', 16000, 'initial rate from the USD pricing brief'
where not exists (select 1 from public.fx_rates where currency = 'IDR');

-- ---------------------------------------------------------------------------
-- Record the USD base on each top-up
-- ---------------------------------------------------------------------------

-- What the customer was charged (local) is already here (`amount`/`currency`).
-- This adds what it was worth in the base currency, plus the rate that produced
-- the local amount, so revenue reporting never has to guess.
alter table public.topups add column if not exists base_usd_cents bigint;
alter table public.topups add column if not exists fx_rate numeric(18, 6);
alter table public.topups add column if not exists fx_currency text;
alter table public.topups add column if not exists tokens_granted bigint;

-- ---------------------------------------------------------------------------
-- RLS: server-only, same posture as every other table
-- ---------------------------------------------------------------------------

alter table public.fx_rates enable row level security;
-- No policies on purpose: only the service role reads or writes this table.

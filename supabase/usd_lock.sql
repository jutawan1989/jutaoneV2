-- JutaOne.Biz — 100% USD lock (Boss final).
--
-- Every transaction settles in USD cents. This migration locks the affiliate
-- money columns to 'USD' so a future gateway or manual insert can never store
-- RM/IDR again:
--   * `affiliate_earnings.currency` must be 'USD'
--   * `milestone_pool.currency` must be 'USD'
--   * `payout_requests.currency` defaults to 'USD' and must be 'USD'
--   * `topups.currency` written by Stripe stays 'USD' when present
--   * `store_rent_payments.currency` must be 'USD'
--
-- Idempotent: safe to re-run. Existing non-USD rows are normalised to USD only
-- when their numeric value is already USD cents (Stripe-era rows); older
-- RM/IDR rows are left untouched by value — the CHECK only gates new writes.
-- Backfill of legacy amounts is a Boss finance decision, not this migration.
--
-- 1. payout_requests: default + check --------------------------------------

alter table public.payout_requests
  alter column currency set default 'USD';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payout_requests_currency_usd'
  ) then
    alter table public.payout_requests
      add constraint payout_requests_currency_usd check (currency = 'USD');
  end if;
end $$;

-- 2. affiliate_earnings: check ----------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'affiliate_earnings_currency_usd'
  ) then
    alter table public.affiliate_earnings
      add constraint affiliate_earnings_currency_usd check (currency = 'USD');
  end if;
end $$;

-- 3. milestone_pool: check ---------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'milestone_pool_currency_usd'
  ) then
    alter table public.milestone_pool
      add constraint milestone_pool_currency_usd check (currency = 'USD');
  end if;
end $$;

-- 4. topups: check (null allowed for legacy rows, USD when set) --------------

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'topups_currency_usd'
  ) then
    alter table public.topups
      add constraint topups_currency_usd check (currency is null or currency = 'USD');
  end if;
end $$;

-- 5. store_rent_payments: check ----------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'store_rent_payments_currency_usd'
  ) then
    alter table public.store_rent_payments
      add constraint store_rent_payments_currency_usd check (currency = 'USD');
  end if;
end $$;

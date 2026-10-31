-- JutaOne.Biz — Curlec (Razorpay) MYR support (CTO directive, Test Mode).
--
-- Curlec settles in MYR sen, but the 100%-USD lock
-- (`supabase/usd_lock.sql`, constraint `topups_currency_usd`) only allows
-- `currency is null or currency = 'USD'` on `public.topups`. Without this
-- migration EVERY Curlec callback upsert fails and no token is ever credited.
--
-- Apply BEFORE Curlec live traffic: paste into the Supabase SQL editor
-- (Singapore project ddpqmdaqgztyezauuqwq) or run through the management API.
-- Idempotent: safe to re-run.
--
-- Scope is deliberately narrow: ONLY `topups.currency` widens to MYR.
-- `affiliate_earnings`, `milestone_pool`, `payout_requests` and
-- `store_rent_payments` stay USD-locked — the Curlec adapter converts the
-- MYR base to US cents at the Boss fixed rate (RM4.70 = $1) before calling
-- `jutaone_distribute_commission`.

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'topups_currency_usd'
  ) then
    alter table public.topups drop constraint topups_currency_usd;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'topups_currency_usd_myr'
  ) then
    alter table public.topups
      add constraint topups_currency_usd_myr check (currency is null or currency in ('USD', 'MYR'));
  end if;
end $$;

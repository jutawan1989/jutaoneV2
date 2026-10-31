-- JutaOne.Biz — withdrawal $5 + $2 admin fee (Boss final, 100% USD).
--
-- Fixed split, integer USD cents:
--   * `amount_minor` = 500 ($5.00 redeem — the net bank transfer)
--   * `fee_minor`    = 200 ($2.00 admin fee, on top, never deducted)
--   * `net_minor`    = 500 ($5.00 net to the member's bank)
--   * minimum balance to request: 700 ($7.00), enforced in the API route
--   * new requests land at status 'pending' for Admin/Boss approval
--
-- Idempotent: safe to re-run.
--
-- 1. fee/net columns ---------------------------------------------------------

alter table public.payout_requests
  add column if not exists fee_minor bigint;

alter table public.payout_requests
  add column if not exists net_minor bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payout_requests_fee_positive'
  ) then
    alter table public.payout_requests
      add constraint payout_requests_fee_positive check (fee_minor is null or fee_minor >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payout_requests_net_positive'
  ) then
    alter table public.payout_requests
      add constraint payout_requests_net_positive check (net_minor is null or net_minor > 0);
  end if;
end $$;

-- 2. 'pending' is a first-class status ---------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payout_requests_status_valid'
  ) then
    alter table public.payout_requests
      add constraint payout_requests_status_valid
      check (status in ('requested', 'approved', 'pending', 'paid', 'rejected'));
  end if;
end $$;

-- 3. USD lock (reinforces supabase/usd_lock.sql for the new columns) ---------

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payout_requests_currency_usd'
  ) then
    alter table public.payout_requests
      add constraint payout_requests_currency_usd check (currency = 'USD');
  end if;
end $$;

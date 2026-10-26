-- JutaOne.Biz — Store Rent payments
--
-- Why this table exists: the first version of the rent webhook extended
-- `paid_until` on every delivery, so Chip retrying a callback (which it does,
-- on any non-2xx or timeout) gave the merchant a free month per retry. Measured
-- before the fix: two identical paid callbacks moved paid_until from 17:33:11 to
-- 17:33:13.
--
-- A payment is now recorded once, keyed by the gateway's purchase id. The
-- subscription is extended only when a new payment row is inserted, so a replay
-- is a no-op rather than extra time.
--
-- Idempotent: safe to re-run.

create table if not exists public.store_rent_payments (
  id bigserial primary key,
  subscription_id uuid not null references public.store_subscriptions (id) on delete restrict,
  -- Chip's purchase id. Unique, so one payment can only ever be applied once.
  provider_id text not null,
  reference text,
  amount_minor bigint not null,
  currency text not null,
  -- What this payment bought, in days, so a future price change is explicable.
  days_granted integer not null default 30,
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz not null default now(),
  constraint store_rent_payments_amount_positive check (amount_minor > 0),
  constraint store_rent_payments_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint store_rent_payments_days_positive check (days_granted > 0)
);

create unique index if not exists store_rent_payments_provider_key
  on public.store_rent_payments (provider_id);

create index if not exists store_rent_payments_subscription_idx
  on public.store_rent_payments (subscription_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Apply a rent payment exactly once
-- ---------------------------------------------------------------------------

-- Returns the new period end when the payment was applied, or the existing
-- period end when it was a replay. Doing the whole thing in one function keeps
-- the "insert payment" and "extend subscription" steps atomic: two statements in
-- the route could half-succeed under a retry.
create or replace function public.jutaone_apply_rent_payment(
  p_subscription uuid,
  p_provider_id text,
  p_reference text,
  p_amount_minor bigint,
  p_currency text,
  p_days integer default 30
)
returns table (applied boolean, period_end timestamptz)
language plpgsql
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_existing timestamptz;
begin
  -- A replay: report the period it originally bought, change nothing.
  select r.period_end into v_existing
    from public.store_rent_payments r
   where r.provider_id = p_provider_id;

  if v_existing is not null then
    return query select false, v_existing;
    return;
  end if;

  -- Extend from the current period end when it is still in the future, so a
  -- merchant who pays early is not punished; otherwise start from now.
  select greatest(coalesce(s.paid_until, now()), now())
    into v_start
    from public.store_subscriptions s
   where s.id = p_subscription;

  if v_start is null then
    raise exception 'subscription % does not exist', p_subscription;
  end if;

  v_end := v_start + make_interval(days => p_days);

  insert into public.store_rent_payments
    (subscription_id, provider_id, reference, amount_minor, currency,
     days_granted, period_start, period_end)
  values
    (p_subscription, p_provider_id, p_reference, p_amount_minor, p_currency,
     p_days, v_start, v_end);

  update public.store_subscriptions
     set status = 'active',
         paid_until = v_end,
         next_billing_date = v_end,
         updated_at = now()
   where id = p_subscription;

  return query select true, v_end;
end $$;

alter table public.store_rent_payments enable row level security;
-- No policies: billing records are server-only.

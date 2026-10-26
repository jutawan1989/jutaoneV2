-- JutaOne.Biz — token ledger
--
-- Task 5 of the Chip brief asks the paid webhook to "add the tokens to the
-- user's balance". There was no balance, so this file defines one.
--
-- The buyer is the pseudonymous `visitor_key` the site already computes (a
-- salted SHA-256 of IP + device headers). Nothing new is collected: no email,
-- no account, no PII. That keeps the existing "no PII before top-up" position
-- intact, and it is the only identity available when Chip's webhook arrives,
-- because the callback has no browser context of its own.
--
-- A balance is the sum of an append-only ledger, never a mutable counter. A
-- replay, a double webhook or a refund therefore cannot silently rewrite
-- history: every change is a row with a reason.
--
-- Idempotency is enforced by the database: one grant per top-up (unique
-- partial index), so a replayed `purchase.paid` credits exactly once.

-- ---------------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------------

create table if not exists public.token_ledger (
  id bigserial primary key,
  -- Pseudonymous buyer identity; the same hash used by demo_attempts.
  visitor_key text not null,
  -- Positive = credit, negative = debit (spend). Zero is meaningless.
  delta bigint not null,
  reason text not null,
  -- One grant per top-up. Null for spends and adjustments.
  topup_id bigint references public.topups (id) on delete restrict,
  -- Running total for this visitor after this row, so a balance can be read
  -- without summing the whole table.
  balance_after bigint,
  base_usd_cents bigint,
  tokens bigint,
  created_at timestamptz not null default now(),
  constraint token_ledger_delta_nonzero check (delta <> 0),
  constraint token_ledger_reason_valid
    check (reason in ('topup', 'spend', 'refund', 'adjustment', 'signup_bonus'))
);

-- The double-credit guard: a top-up can be granted once, ever.
create unique index if not exists token_ledger_topup_grant_key
  on public.token_ledger (topup_id)
  where reason = 'topup' and topup_id is not null;

create index if not exists token_ledger_visitor_idx
  on public.token_ledger (visitor_key, created_at desc);

-- ---------------------------------------------------------------------------
-- Balance helper
-- ---------------------------------------------------------------------------

create or replace function public.jutaone_token_balance(target_visitor text)
returns bigint
language sql
stable
as $$
  select coalesce(sum(delta), 0)::bigint
    from public.token_ledger
   where visitor_key = target_visitor;
$$;

-- ---------------------------------------------------------------------------
-- Guard: every credit is well formed, and balance_after is computed here
-- ---------------------------------------------------------------------------

create or replace function public.jutaone_guard_ledger()
returns trigger
language plpgsql
as $$
declare
  v_balance bigint;
begin
  if new.reason = 'topup' then
    if new.topup_id is null then
      raise exception 'a topup credit must reference a top-up';
    end if;
    if new.delta <= 0 then
      raise exception 'a topup credit must be positive (got %)', new.delta;
    end if;
    -- The top-up must be paid, so a webhook racing the status update cannot
    -- grant tokens for a purchase that never completed.
    if not exists (
      select 1 from public.topups where id = new.topup_id and status = 'paid'
    ) then
      raise exception 'topup % is not paid', new.topup_id;
    end if;
    if exists (
      select 1 from public.token_ledger
       where topup_id = new.topup_id and reason = 'topup'
    ) then
      raise exception 'topup % has already been credited', new.topup_id;
    end if;
  else
    if new.topup_id is not null then
      raise exception 'only topup credits may reference a top-up';
    end if;
  end if;

  -- Serialise per visitor so balance_after cannot interleave under concurrency.
  perform pg_advisory_xact_lock(hashtext(new.visitor_key));

  select coalesce(sum(delta), 0) into v_balance
    from public.token_ledger
   where visitor_key = new.visitor_key;

  new.balance_after := v_balance + new.delta;
  if new.balance_after < 0 then
    raise exception 'insufficient token balance for % (balance %, delta %)',
      new.visitor_key, v_balance, new.delta;
  end if;

  return new;
end $$;

drop trigger if exists jutaone_guard_ledger_trg on public.token_ledger;
create trigger jutaone_guard_ledger_trg
  before insert on public.token_ledger
  for each row execute function public.jutaone_guard_ledger();

-- ---------------------------------------------------------------------------
-- Record who paid, on the top-up itself
-- ---------------------------------------------------------------------------

-- Chip's webhook has no browser session, but the purchase reference is ours, so
-- the visitor can be recovered from the `topup_click` event at checkout time.
alter table public.topups add column if not exists visitor_key text;
create index if not exists topups_visitor_key_idx on public.topups (visitor_key);

-- What the customer was charged is already here (`amount`/`currency`). These add
-- what it was worth in the base currency plus the rate that produced the local
-- amount, so revenue reporting never has to guess a historical FX rate.
alter table public.topups add column if not exists base_usd_cents bigint;
alter table public.topups add column if not exists fx_rate numeric(18, 6);
alter table public.topups add column if not exists fx_currency text;
alter table public.topups add column if not exists tokens_granted bigint;

-- ---------------------------------------------------------------------------
-- RLS: server-only, same posture as every other table
-- ---------------------------------------------------------------------------

alter table public.token_ledger enable row level security;
-- No policies on purpose: only the service role reads or writes this table.

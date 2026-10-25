-- JutaOne.Biz — Phase 2 affiliate schema
--
-- Specs: 70% cash to the affiliate / 30% retained by the company, manual
-- payouts, anti-fraud. Idempotent: safe to re-run, and the region move runs it
-- again against the new project.
--
-- Money is stored in integer minor units (sen / rupiah), matching
-- `topups.amount`, so no float ever touches a payout. The 70/30 split is
-- computed from `commission_bps` (basis points, 7000 = 70%) and the company
-- share is the remainder, so the two shares always add back to the gross.
--
-- Anti-fraud is enforced in the database, not left to the caller:
--   1. one earning row per top-up (unique index) — replaying a webhook cannot
--      credit an affiliate twice;
--   2. the split is computed by a trigger, so a caller cannot inflate it;
--   3. an earning requires a paid top-up and an active referral code;
--   4. self-referral is rejected by comparing the buyer's visitor hash with the
--      code owner's hash;
--   5. a payout cannot exceed the affiliate's unpaid balance, counting money
--      already reserved by an open request;
--   6. marking a payout paid consumes approved earnings FIFO and refuses to
--      over-allocate.
--
-- No PII lives here. `owner_ref` is an opaque identifier and
-- `payout_requests.payee_reference` points at a payee record held elsewhere;
-- raw bank account numbers are deliberately not columns in this schema.

-- ---------------------------------------------------------------------------
-- 1. Referral codes
-- ---------------------------------------------------------------------------

create table if not exists public.referral_codes (
  id bigserial primary key,
  code text not null,
  -- Opaque affiliate identity. Deliberately not a name, email or phone number.
  owner_ref text not null,
  -- Salted SHA-256 of the affiliate's own browser, used only for the
  -- self-referral check. Same format as `demo_attempts.visitor_key`.
  owner_visitor_key text,
  commission_bps integer not null default 7000,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  notes text,
  constraint referral_codes_code_format
    check (code = lower(code) and code ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  constraint referral_codes_commission_range check (commission_bps between 0 and 10000)
);

-- Codes are looked up by value, so uniqueness is case-insensitive by
-- construction (the check constraint already forbids uppercase).
create unique index if not exists referral_codes_code_key on public.referral_codes (code);
create index if not exists referral_codes_owner_idx on public.referral_codes (owner_ref);
create index if not exists referral_codes_owner_visitor_idx on public.referral_codes (owner_visitor_key);

-- ---------------------------------------------------------------------------
-- 2. Attribution on top-ups
-- ---------------------------------------------------------------------------

alter table public.topups add column if not exists referral_code_id bigint;
-- Buyer identity at purchase time, so self-referral can be checked. Nullable:
-- Chip's webhook has no visitor context, and older rows predate this column.
alter table public.topups add column if not exists buyer_visitor_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'topups_referral_code_fk'
  ) then
    alter table public.topups
      add constraint topups_referral_code_fk
      foreign key (referral_code_id) references public.referral_codes (id)
      on delete set null;
  end if;
end $$;

create index if not exists topups_referral_code_idx on public.topups (referral_code_id);

-- ---------------------------------------------------------------------------
-- 3. Payout requests (manual payouts)
-- ---------------------------------------------------------------------------

create table if not exists public.payout_requests (
  id bigserial primary key,
  referral_code_id bigint not null references public.referral_codes (id) on delete restrict,
  currency text not null,
  amount_minor bigint not null,
  status text not null default 'requested',
  method text,
  -- Opaque pointer to the verified payee record. Never a raw account number.
  payee_reference text,
  note text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  paid_at timestamptz,
  constraint payout_requests_amount_positive check (amount_minor > 0),
  constraint payout_requests_status_valid
    check (status in ('requested', 'approved', 'paid', 'rejected', 'cancelled'))
);

create index if not exists payout_requests_code_status_idx
  on public.payout_requests (referral_code_id, status);
create index if not exists payout_requests_requested_at_idx
  on public.payout_requests (requested_at);

-- ---------------------------------------------------------------------------
-- 4. Split helper
-- ---------------------------------------------------------------------------

create or replace function public.jutaone_affiliate_split(gross_minor bigint, bps integer)
returns table (affiliate_share_minor bigint, company_share_minor bigint)
language sql
immutable
as $$
  select
    round(gross_minor::numeric * bps / 10000)::bigint as affiliate_share_minor,
    gross_minor - round(gross_minor::numeric * bps / 10000)::bigint as company_share_minor;
$$;

-- ---------------------------------------------------------------------------
-- 5. Earnings ledger
-- ---------------------------------------------------------------------------

create table if not exists public.affiliate_earnings (
  id bigserial primary key,
  referral_code_id bigint not null references public.referral_codes (id) on delete restrict,
  topup_id bigint not null references public.topups (id) on delete cascade,
  payout_request_id bigint references public.payout_requests (id) on delete set null,
  currency text not null,
  gross_minor bigint not null,
  commission_bps integer not null,
  affiliate_share_minor bigint not null,
  company_share_minor bigint not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affiliate_earnings_gross_positive check (gross_minor > 0),
  constraint affiliate_earnings_status_valid
    check (status in ('pending', 'approved', 'paid', 'void')),
  constraint affiliate_earnings_shares_add_up
    check (affiliate_share_minor + company_share_minor = gross_minor),
  constraint affiliate_earnings_shares_non_negative
    check (affiliate_share_minor >= 0 and company_share_minor >= 0)
);

-- The idempotency guarantee: a top-up can be credited exactly once.
create unique index if not exists affiliate_earnings_topup_key
  on public.affiliate_earnings (topup_id);
create index if not exists affiliate_earnings_code_status_idx
  on public.affiliate_earnings (referral_code_id, status);
create index if not exists affiliate_earnings_payout_idx
  on public.affiliate_earnings (payout_request_id);

-- ---------------------------------------------------------------------------
-- 6. Guard: only legitimate earnings get written
-- ---------------------------------------------------------------------------

create or replace function public.jutaone_guard_earning()
returns trigger
language plpgsql
as $$
declare
  v_code_active boolean;
  v_code_owner_key text;
  v_bps integer;
  v_topup_status text;
  v_topup_amount bigint;
  v_topup_currency text;
  v_topup_code bigint;
  v_buyer_key text;
begin
  select active, owner_visitor_key, commission_bps
    into v_code_active, v_code_owner_key, v_bps
    from public.referral_codes
   where id = new.referral_code_id;

  if v_code_active is null then
    raise exception 'referral code % does not exist', new.referral_code_id;
  end if;
  if not v_code_active then
    raise exception 'referral code % is not active', new.referral_code_id;
  end if;

  select status, amount, currency, referral_code_id, buyer_visitor_key
    into v_topup_status, v_topup_amount, v_topup_currency, v_topup_code, v_buyer_key
    from public.topups
   where id = new.topup_id;

  if v_topup_status is null then
    raise exception 'topup % does not exist', new.topup_id;
  end if;
  -- No money in, no commission out.
  if v_topup_status <> 'paid' then
    raise exception 'topup % is not paid (status=%)', new.topup_id, v_topup_status;
  end if;
  -- The attribution recorded on the top-up wins; this stops a caller from
  -- crediting a code that the purchase was never attributed to.
  if v_topup_code is not null and v_topup_code <> new.referral_code_id then
    raise exception 'topup % is attributed to referral code %, not %',
      new.topup_id, v_topup_code, new.referral_code_id;
  end if;
  -- Self-referral: an affiliate cannot earn on their own purchase.
  if v_code_owner_key is not null and v_buyer_key is not null
     and v_code_owner_key = v_buyer_key then
    raise exception 'self-referral rejected for referral code %', new.referral_code_id;
  end if;

  if v_topup_amount is null then
    raise exception 'topup % has no amount', new.topup_id;
  end if;

  -- The trigger owns the money columns: caller-supplied values are ignored.
  new.currency := coalesce(v_topup_currency, new.currency);
  new.gross_minor := v_topup_amount;
  new.commission_bps := v_bps;
  select s.affiliate_share_minor, s.company_share_minor
    into new.affiliate_share_minor, new.company_share_minor
    from public.jutaone_affiliate_split(new.gross_minor, v_bps) s;
  new.updated_at := now();

  return new;
end $$;

drop trigger if exists jutaone_guard_earning_trg on public.affiliate_earnings;
create trigger jutaone_guard_earning_trg
  before insert on public.affiliate_earnings
  for each row execute function public.jutaone_guard_earning();

-- The unique index on topup_id is the hard guarantee against double credit,
-- but it is checked at index insertion time — after a race between two
-- concurrent webhook retries. This trigger makes the common case fail with a
-- readable message instead of a raw unique_violation, and makes the intent
-- explicit for anyone reading the schema.
create or replace function public.jutaone_guard_duplicate_earning()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.affiliate_earnings where topup_id = new.topup_id
  ) then
    raise exception 'topup % has already been credited to an affiliate', new.topup_id;
  end if;
  return new;
end $$;

drop trigger if exists jutaone_guard_duplicate_earning_trg on public.affiliate_earnings;
create trigger jutaone_guard_duplicate_earning_trg
  before insert on public.affiliate_earnings
  for each row execute function public.jutaone_guard_duplicate_earning();

-- ---------------------------------------------------------------------------
-- 7. Guard: a payout cannot exceed the unpaid balance
-- ---------------------------------------------------------------------------

create or replace function public.jutaone_guard_payout_request()
returns trigger
language plpgsql
as $$
declare
  v_accrued bigint;
  v_reserved bigint;
begin
  if new.status not in ('requested', 'approved') then
    return new;
  end if;

  select coalesce(sum(affiliate_share_minor), 0)
    into v_accrued
    from public.affiliate_earnings
   where referral_code_id = new.referral_code_id
     and currency = new.currency
     and status in ('pending', 'approved');

  select coalesce(sum(amount_minor), 0)
    into v_reserved
    from public.payout_requests
   where referral_code_id = new.referral_code_id
     and currency = new.currency
     and status in ('requested', 'approved')
     and id <> coalesce(new.id, -1);

  if new.amount_minor > v_accrued - v_reserved then
    raise exception
      'payout of % % exceeds available balance % (accrued %, reserved %)',
      new.amount_minor, new.currency, v_accrued - v_reserved, v_accrued, v_reserved;
  end if;

  return new;
end $$;

drop trigger if exists jutaone_guard_payout_request_trg on public.payout_requests;
create trigger jutaone_guard_payout_request_trg
  before insert or update of amount_minor, status, currency, referral_code_id
  on public.payout_requests
  for each row execute function public.jutaone_guard_payout_request();

-- ---------------------------------------------------------------------------
-- 8. Marking a payout paid consumes approved earnings, oldest first
-- ---------------------------------------------------------------------------

create or replace function public.jutaone_settle_payout()
returns trigger
language plpgsql
as $$
declare
  v_remaining bigint := new.amount_minor;
  v_row record;
  v_take bigint;
begin
  if new.status <> 'paid' or old.status = 'paid' then
    return new;
  end if;

  for v_row in
    select id, affiliate_share_minor
      from public.affiliate_earnings
     where referral_code_id = new.referral_code_id
       and currency = new.currency
       -- Both states are counted as available by the balance guard, so both
       -- must be consumable here; otherwise a payout could be requested
       -- against a pending earning and then never settle.
       and status in ('pending', 'approved')
     order by created_at, id
     for update
  loop
    exit when v_remaining <= 0;

    -- Whole rows only: a partial cent split would not reconcile against the
    -- payout, and rounding must never favour either side silently.
    if v_row.affiliate_share_minor > v_remaining then
      continue;
    end if;

    update public.affiliate_earnings
       set status = 'paid',
           payout_request_id = new.id,
           updated_at = now()
     where id = v_row.id;

    v_remaining := v_remaining - v_row.affiliate_share_minor;
  end loop;

  if v_remaining <> 0 then
    raise exception 'payout % could not be settled: % % left unallocated',
      new.id, v_remaining, new.currency;
  end if;

  new.paid_at := coalesce(new.paid_at, now());
  new.decided_at := coalesce(new.decided_at, now());
  return new;
end $$;

drop trigger if exists jutaone_settle_payout_trg on public.payout_requests;
create trigger jutaone_settle_payout_trg
  before update of status on public.payout_requests
  for each row execute function public.jutaone_settle_payout();

-- ---------------------------------------------------------------------------
-- 9. Balance view — what an affiliate has earned, reserved and available
-- ---------------------------------------------------------------------------

create or replace view public.affiliate_balances as
with earned as (
  select
    referral_code_id,
    currency,
    sum(affiliate_share_minor) filter (where status in ('pending', 'approved')) as unpaid_minor,
    sum(affiliate_share_minor) filter (where status = 'paid') as paid_minor,
    sum(company_share_minor) filter (where status <> 'void') as company_minor,
    count(*) filter (where status in ('pending', 'approved')) as open_earnings
  from public.affiliate_earnings
  group by referral_code_id, currency
), reserved as (
  select
    referral_code_id,
    currency,
    sum(amount_minor) filter (where status in ('requested', 'approved')) as reserved_minor
  from public.payout_requests
  group by referral_code_id, currency
)
select
  coalesce(e.referral_code_id, r.referral_code_id) as referral_code_id,
  coalesce(e.currency, r.currency) as currency,
  coalesce(e.unpaid_minor, 0) as unpaid_minor,
  coalesce(r.reserved_minor, 0) as reserved_minor,
  coalesce(e.unpaid_minor, 0) - coalesce(r.reserved_minor, 0) as available_minor,
  coalesce(e.paid_minor, 0) as paid_minor,
  coalesce(e.company_minor, 0) as company_minor,
  coalesce(e.open_earnings, 0) as open_earnings
from earned e
full outer join reserved r
  on r.referral_code_id = e.referral_code_id and r.currency = e.currency;

-- ---------------------------------------------------------------------------
-- 10. RLS: server-only, same posture as the Phase 1 tables
-- ---------------------------------------------------------------------------

alter table public.referral_codes enable row level security;
alter table public.affiliate_earnings enable row level security;
alter table public.payout_requests enable row level security;
-- No policies on purpose: anon and authenticated keys get no access. Only the
-- service role (server-side API routes) reads or writes these tables.

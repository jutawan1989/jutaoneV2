-- JutaOne.Biz — Store Rent (subscription), separate from token pricing
--
-- Tokens stay $1 = 1,000,000. Store Rent is its own $5.00/month product with a
-- 7-day trial, billed in local currency at checkout the same way tokens are.
--
-- Identity: `owner_ref` is the same opaque visitor hash used by the storefront,
-- the token ledger and the affiliate schema. There is no user account anywhere
-- in this system, so a UUID primary key would imply an identity that does not
-- exist; the brief's `user_id` is therefore `owner_ref`, and the row id is the
-- UUID.
--
-- Money is integer minor units, matching every other table.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Subscription
-- ---------------------------------------------------------------------------

create table if not exists public.store_subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- Pseudonymous merchant identifier, not an account.
  owner_ref text not null,
  plan text not null default 'store_pro',
  status text not null default 'trial',
  trial_ends_at timestamptz,
  next_billing_date timestamptz,
  -- The subscription that pays for this store, when it is paid rather than
  -- trialled. Set by the billing webhook.
  paid_until timestamptz,
  -- Which referral code brought this merchant in, for the affiliate split.
  referral_code_id bigint references public.referral_codes (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_subscriptions_status_valid
    check (status in ('trial', 'active', 'past_due', 'cancelled')),
  constraint store_subscriptions_plan_valid check (plan in ('store_pro')),
  constraint store_subscriptions_trial_has_end
    check (status <> 'trial' or trial_ends_at is not null)
);

-- One subscription per merchant: a second "start trial" cannot reset the clock.
create unique index if not exists store_subscriptions_owner_key
  on public.store_subscriptions (owner_ref);

create index if not exists store_subscriptions_status_idx
  on public.store_subscriptions (status, trial_ends_at);

-- ---------------------------------------------------------------------------
-- Entitlement: is this store open right now?
-- ---------------------------------------------------------------------------

-- A storefront is open while the trial is running or the subscription is paid
-- up. Expiry is evaluated at read time rather than by a cron job, so a lapsed
-- trial closes the shop immediately instead of whenever a scheduler next wakes.
--
-- A merchant with NO subscription row is OPEN. This is deliberate: storefronts
-- created before Store Rent existed must not vanish the moment this ships, and a
-- merchant who never opted in is not delinquent. Closing a shop is a decision
-- about a subscription that exists, not about one that was never created.
create or replace function public.jutaone_store_is_open(target_owner text)
returns boolean
language sql
stable
as $$
  select not exists (
    select 1
      from public.store_subscriptions s
     where s.owner_ref = target_owner
       and not (
         (s.status = 'trial' and s.trial_ends_at > now())
         or (s.status = 'active' and (s.paid_until is null or s.paid_until > now()))
       )
  );
$$;

/**
 * Resolves a shop slug to its owner and entitlement in one round trip, so the
 * storefront page does not have to join two queries to decide whether to render
 * products or the "store inactive" notice.
 */
create or replace function public.jutaone_shop_status(p_slug text)
returns table (owner_ref text, is_open boolean, status text, trial_ends_at timestamptz)
language sql
stable
as $$
  select
    p.owner_ref,
    coalesce(public.jutaone_store_is_open(p.owner_ref), false) as is_open,
    coalesce(s.status, 'active') as status,
    s.trial_ends_at
  from (
    select distinct on (shop_slug) shop_slug, owner_ref
      from public.merchant_products
     where shop_slug = p_slug
     limit 1
  ) p
  left join public.store_subscriptions s on s.owner_ref = p.owner_ref;
$$;

-- ---------------------------------------------------------------------------
-- Trial expiry as a sweep, for reporting rather than for enforcement
-- ---------------------------------------------------------------------------

-- Enforcement is at read time (see jueone_store_is_open). This function exists so
-- an admin view can show "who lapsed" without recomputing every row, and so the
-- status column does not drift indefinitely from reality.
create or replace function public.jutaone_expire_trials()
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update public.store_subscriptions
     set status = 'past_due',
         updated_at = now()
   where status = 'trial'
     and trial_ends_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Affiliate share of the rent
-- ---------------------------------------------------------------------------

-- Task 4 asks for 70% of the $5.00 rent ($3.50) to reach the referring
-- affiliate's cash wallet. `cash_wallet` did not exist; the affiliate schema
-- already models money as `affiliate_earnings` + the `affiliate_balances` view,
-- so rent is recorded there as its own ledger rather than as a second wallet —
-- two balances for the same money is how payouts stop reconciling.
--
-- `topup_id` is nullable there because rent is not a token top-up. The columns
-- are reused deliberately: same 70/30 split, same payout flow, same anti-fraud.
alter table public.affiliate_earnings
  add column if not exists rent_subscription_id uuid
    references public.store_subscriptions (id) on delete restrict;

-- Rent earnings have no token top-up behind them, so this column must allow
-- NULL; the original constraint assumed every earning came from a top-up.
alter table public.affiliate_earnings alter column topup_id drop not null;

-- An earning must come from exactly one source: a top-up or a rent period.
-- Without this, a row could reference both (double-counted) or neither
-- (unexplained money appearing in an affiliate's balance).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'affiliate_earnings_single_source'
  ) then
    alter table public.affiliate_earnings
      add constraint affiliate_earnings_single_source
      check (num_nonnulls(topup_id, rent_subscription_id) = 1);
  end if;
end $$;

create unique index if not exists affiliate_earnings_rent_key
  on public.affiliate_earnings (rent_subscription_id);

-- ON CONFLICT needs a real constraint, not an index. NULL is distinct in
-- Postgres, so top-up earnings (rent_subscription_id IS NULL) are unaffected.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'affiliate_earnings_rent_uniq'
  ) then
    alter table public.affiliate_earnings
      add constraint affiliate_earnings_rent_uniq unique (rent_subscription_id);
  end if;
end $$;

-- One rent earning per subscription per period; the index above makes a
-- replayed billing webhook idempotent.
-- `create or replace` cannot change a return type, and this function was first
-- written returning uuid by mistake. Dropping first keeps a re-run safe.
drop function if exists public.jutaone_credit_rent_affiliate(uuid, bigint, text);

create or replace function public.jutaone_credit_rent_affiliate(
  p_subscription uuid,
  p_gross_minor bigint,
  p_currency text
)
-- Returns the created earning id (bigint). affiliate_earnings.id is a bigserial,
-- not a uuid; the subscription is the only uuid in this path.
returns bigint
language plpgsql
as $$
declare
  v_code bigint;
  v_bps integer;
  v_affiliate bigint;
  v_company bigint;
  v_id bigint;
begin
  select referral_code_id into v_code
    from public.store_subscriptions where id = p_subscription;

  -- No referrer means the whole rent is company revenue; nothing to credit.
  if v_code is null then
    return null;
  end if;

  select commission_bps into v_bps from public.referral_codes where id = v_code;
  if v_bps is null then
    return null;
  end if;

  select affiliate_share_minor, company_share_minor
    into v_affiliate, v_company
    from public.jutaone_affiliate_split(p_gross_minor, v_bps) s;

  insert into public.affiliate_earnings
    (referral_code_id, topup_id, rent_subscription_id, currency, gross_minor,
     commission_bps, affiliate_share_minor, company_share_minor, status)
  values
    (v_code, null, p_subscription, p_currency, p_gross_minor,
     v_bps, v_affiliate, v_company, 'approved')
  -- Idempotent per subscription: a replayed billing webhook must not pay the
  -- affiliate twice. The target is the rent index, not the referral code — one
  -- affiliate records many earnings, so conflicting on the code would swallow
  -- every earning after the first.
  on conflict (rent_subscription_id) do nothing
  returning id into v_id;

  return v_id;
end $$;

-- The guard trigger requires a topup_id for `topup` earnings; rent earnings carry
-- no top-up, so relax that specific check without weakening the rest.
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

  -- Rent earnings: no top-up to inspect, and the amount is supplied by the
  -- billing path, so only the split is recomputed.
  if new.rent_subscription_id is not null then
    new.commission_bps := v_bps;
    select s.affiliate_share_minor, s.company_share_minor
      into new.affiliate_share_minor, new.company_share_minor
      from public.jutaone_affiliate_split(new.gross_minor, v_bps) s;
    new.updated_at := now();
    return new;
  end if;

  select status, amount, currency, referral_code_id, buyer_visitor_key
    into v_topup_status, v_topup_amount, v_topup_currency, v_topup_code, v_buyer_key
    from public.topups
   where id = new.topup_id;

  if v_topup_status is null then
    raise exception 'topup % does not exist', new.topup_id;
  end if;
  if v_topup_status <> 'paid' then
    raise exception 'topup % is not paid (status=%)', new.topup_id, v_topup_status;
  end if;
  if v_topup_code is not null and v_topup_code <> new.referral_code_id then
    raise exception 'topup % is attributed to referral code %, not %',
      new.topup_id, v_topup_code, new.referral_code_id;
  end if;
  if v_code_owner_key is not null and v_buyer_key is not null
     and v_code_owner_key = v_buyer_key then
    raise exception 'self-referral rejected for referral code %', new.referral_code_id;
  end if;
  if v_topup_amount is null then
    raise exception 'topup % has no amount', new.topup_id;
  end if;

  new.currency := coalesce(v_topup_currency, new.currency);
  new.gross_minor := v_topup_amount;
  new.commission_bps := v_bps;
  select s.affiliate_share_minor, s.company_share_minor
    into new.affiliate_share_minor, new.company_share_minor
    from public.jutaone_affiliate_split(new.gross_minor, v_bps) s;
  new.updated_at := now();

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- RLS: server-only
-- ---------------------------------------------------------------------------

alter table public.store_subscriptions enable row level security;
-- No policies: a merchant's billing state is read by our server, never by a
-- public key. A world-readable subscriptions table would leak who is on trial
-- and who has lapsed.

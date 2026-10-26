-- JutaOne.Biz — 19-level affiliate matrix
--
-- Linda's spec: level 1 takes 50%, levels 2-19 share 20%, and a 5% milestone
-- pool is withheld. Total 70%; company keeps 30%.
--
-- Verified arithmetic (scripts/qa-matrix.mjs asserts it):
--   L1 50 + L2 4 + L3 3 + L4 2 + L5 1        = 60
--   L6-10  5 x 0.50                          =  2.5
--   L11-15 5 x 0.30                          =  1.5
--   L16-19 4 x 0.25                          =  1.0
--   subtotal                                  65.0
--   milestone pool 5.0  -> total              70.0
--
-- Two structural problems had to be solved before the matrix could exist:
--
-- 1. `affiliate_earnings` was unique on `topup_id` alone, so a top-up could
--    ever credit exactly ONE affiliate. The unique key becomes
--    (topup_id, level) and (rent_subscription_id, level), which keeps replay
--    protection while allowing the chain.
-- 2. There was no tree. `referral_codes` gains `parent_code_id`, and a trigger
--    refuses to create a cycle — a cycle would make the recursive walk infinite
--    and take the webhook down with it.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. The tree
-- ---------------------------------------------------------------------------

alter table public.referral_codes
  add column if not exists parent_code_id bigint
    references public.referral_codes (id) on delete set null;

create index if not exists referral_codes_parent_idx
  on public.referral_codes (parent_code_id);

/**
 * Refuses to create a cycle.
 *
 * Walking a cycle is not "slow", it is unbounded: the recursive CTE in
 * `jutaone_distribute_commission` would never terminate and the payment webhook
 * would hang. Cheaper to reject the edge than to guard every traversal.
 */
create or replace function public.jutaone_guard_referral_cycle()
returns trigger
language plpgsql
as $$
begin
  if new.parent_code_id is null then
    return new;
  end if;
  if new.parent_code_id = new.id then
    raise exception 'a referral code cannot be its own parent';
  end if;

  -- Is the proposed parent already downstream of this node?
  if exists (
    with recursive descendants as (
      select id, parent_code_id
        from public.referral_codes
       where parent_code_id = new.id
      union all
      select c.id, c.parent_code_id
        from public.referral_codes c
        join descendants d on c.parent_code_id = d.id
    )
    select 1 from descendants where id = new.parent_code_id
  ) then
    raise exception 'referral cycle rejected: % is downstream of %',
      new.parent_code_id, new.id;
  end if;

  return new;
end $$;

drop trigger if exists jutaone_guard_referral_cycle_trg on public.referral_codes;
create trigger jutaone_guard_referral_cycle_trg
  before insert or update of parent_code_id on public.referral_codes
  for each row execute function public.jutaone_guard_referral_cycle();

/** Depth of a node, so a chain cannot be built deeper than the matrix pays. */
create or replace function public.jutaone_referral_depth(target bigint)
returns integer
language sql
stable
as $$
  with recursive up as (
    select id, parent_code_id, 1 as depth
      from public.referral_codes where id = target
    union all
    select c.id, c.parent_code_id, up.depth + 1
      from public.referral_codes c
      join up on c.id = up.parent_code_id
     where up.depth < 64
  )
  select coalesce(max(depth), 0)::integer from up;
$$;

-- ---------------------------------------------------------------------------
-- 2. Earnings: one row per (purchase, level)
-- ---------------------------------------------------------------------------

alter table public.affiliate_earnings
  add column if not exists level integer;

alter table public.affiliate_earnings
  add column if not exists referred_code_id bigint
    references public.referral_codes (id) on delete set null;

-- Level is meaningful for every row now, including legacy rent/topup rows.
update public.affiliate_earnings set level = 1 where level is null;

alter table public.affiliate_earnings
  alter column level set default 1;
alter table public.affiliate_earnings
  alter column level set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'affiliate_earnings_level_range'
  ) then
    alter table public.affiliate_earnings
      add constraint affiliate_earnings_level_range check (level between 1 and 19);
  end if;
end $$;

-- Replace the single-winner unique keys with per-level ones. Dropping the index
-- is what allows 19 affiliates to be paid from one purchase.
drop index if exists public.affiliate_earnings_topup_key;
drop index if exists public.affiliate_earnings_rent_key;

-- A partial unique index is enough for the constraint and keeps NULLs free.
create unique index if not exists affiliate_earnings_topup_level_key
  on public.affiliate_earnings (topup_id, level)
  where topup_id is not null;

create unique index if not exists affiliate_earnings_rent_level_key
  on public.affiliate_earnings (rent_subscription_id, level)
  where rent_subscription_id is not null;

-- The old single-column constraints (if created as constraints) must go too.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'affiliate_earnings_rent_uniq'
  ) then
    alter table public.affiliate_earnings drop constraint affiliate_earnings_rent_uniq;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The matrix, in one place
-- ---------------------------------------------------------------------------

/**
 * Basis points paid at a level, out of the gross payment.
 * 5000 = 50%. Kept as a function so the webhook, the tests and any report read
 * the same numbers.
 */
create or replace function public.jutaone_level_bps(target_level integer)
returns integer
language sql
immutable
as $$
  select case
    when target_level = 1  then 5000
    when target_level = 2  then 400
    when target_level = 3  then 300
    when target_level = 4  then 200
    when target_level = 5  then 100
    when target_level between 6  and 10 then 50
    when target_level between 11 and 15 then 30
    when target_level between 16 and 19 then 25
    else 0
  end;
$$;

/**
 * 500 bps = 5% milestone pool, withheld rather than paid to any affiliate.
 * The first version used 50 bps, which is 0.5%: the pool came out ten times too
 * small and the total payout was 65.5% instead of 70%.
 */
create or replace function public.jutaone_milestone_bps()
returns integer
language sql
immutable
as $$ select 500; $$;

-- ---------------------------------------------------------------------------
-- 4. The milestone pool
-- ---------------------------------------------------------------------------

create table if not exists public.milestone_pool (
  id bigserial primary key,
  source text not null,
  topup_id bigint references public.topups (id) on delete set null,
  rent_subscription_id uuid references public.store_subscriptions (id) on delete set null,
  currency text not null,
  gross_minor bigint not null,
  pool_minor bigint not null,
  created_at timestamptz not null default now(),
  constraint milestone_pool_pool_positive check (pool_minor >= 0),
  constraint milestone_pool_source_valid check (source in ('topup', 'rent'))
);

create unique index if not exists milestone_pool_topup_key
  on public.milestone_pool (topup_id) where topup_id is not null;
create unique index if not exists milestone_pool_rent_key
  on public.milestone_pool (rent_subscription_id) where rent_subscription_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Recursive distribution
-- ---------------------------------------------------------------------------

/**
 * Pays the upline chain for one purchase.
 *
 * Walks from the buyer's code up through parents, at most 19 hops, and writes
 * one earning per level that exists. A chain shorter than 19 simply pays fewer
 * levels — nothing is redistributed to the company, because the percentages are
 * defined against the gross payment, not a fixed pool.
 *
 * Idempotent per (purchase, level): replaying the same webhook hits the unique
 * indexes and is a no-op, so a Chip retry cannot double-pay a chain.
 *
 * Returns the number of earnings actually written.
 */
create or replace function public.jutaone_distribute_commission(
  p_source text,               -- 'topup' | 'rent'
  p_topup_id bigint,           -- null for rent
  p_rent_id uuid,              -- null for topup
  p_from_code_id bigint,       -- the buyer's own code; level 1 is its parent
  p_gross_minor bigint,
  p_currency text
)
returns integer
language plpgsql
as $$
declare
  v_written integer := 0;
  v_pool_minor bigint;
  v_row record;
begin
  if p_source not in ('topup', 'rent') then
    raise exception 'unknown commission source %', p_source;
  end if;
  if p_gross_minor is null or p_gross_minor < 0 then
    raise exception 'invalid gross amount %', p_gross_minor;
  end if;

  -- Walk up from the buyer's referrer. `level` starts at 1 for the direct
  -- referrer, which matches the matrix definition.
  for v_row in
    with recursive upline as (
      select c.id, c.parent_code_id, 1 as level
        from public.referral_codes c
       where c.id = (select parent_code_id from public.referral_codes where id = p_from_code_id)
      union all
      select c.id, c.parent_code_id, u.level + 1
        from public.referral_codes c
        join upline u on c.id = u.parent_code_id
       where u.level < 19
    )
    select id, level, public.jutaone_level_bps(level) as bps
      from upline
     where public.jutaone_level_bps(level) > 0
     order by level
  loop
    declare
      v_share bigint := round(p_gross_minor::numeric * v_row.bps / 10000)::bigint;
      v_company bigint;
    begin
      if v_share <= 0 then
        continue;
      end if;
      v_company := p_gross_minor - v_share;

      insert into public.affiliate_earnings
        (referral_code_id, referred_code_id, topup_id, rent_subscription_id, level,
         currency, gross_minor, commission_bps, affiliate_share_minor,
         company_share_minor, status)
      values
        (v_row.id, p_from_code_id,
         case when p_source = 'topup' then p_topup_id else null end,
         case when p_source = 'rent' then p_rent_id else null end,
         v_row.level,
         p_currency, p_gross_minor, v_row.bps, v_share, v_company, 'approved')
      -- A replay of the same purchase at the same level is a no-op rather than
      -- an error, so the webhook can be safely retried.
      on conflict do nothing;

      if found then
        v_written := v_written + 1;
      end if;
    end;
  end loop;

  -- Withhold the milestone share, once per purchase.
  v_pool_minor := round(p_gross_minor::numeric * public.jutaone_milestone_bps() / 10000)::bigint;
  if v_pool_minor > 0 then
    insert into public.milestone_pool
      (source, topup_id, rent_subscription_id, currency, gross_minor, pool_minor)
    values
      (p_source,
       case when p_source = 'topup' then p_topup_id else null end,
       case when p_source = 'rent' then p_rent_id else null end,
       p_currency, p_gross_minor, v_pool_minor)
    on conflict do nothing;
  end if;

  return v_written;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Network size per level, for the dashboard
-- ---------------------------------------------------------------------------

/**
 * How many people sit at each level below a code, 1..19.
 *
 * Returns one row per level including zeros, so the UI can render a stable
 * 19-row table instead of guessing which levels are missing.
 */
create or replace function public.jutaone_network_counts(p_code_id bigint)
returns table (level integer, people integer, passive_earnings_minor bigint)
language sql
stable
as $$
  with recursive downline as (
    select c.id, 1 as level
      from public.referral_codes c
     where c.parent_code_id = p_code_id
    union all
    select c.id, d.level + 1
      from public.referral_codes c
      join downline d on c.parent_code_id = d.id
     where d.level < 19
  ),
  per_level as (
    select level, count(*)::integer as people from downline group by level
  ),
  earnings as (
    -- Passive income means levels 2-19; level 1 is the direct referral and is
    -- reported separately by the caller.
    select e.level, sum(e.affiliate_share_minor)::bigint as amount
      from public.affiliate_earnings e
     where e.referral_code_id = p_code_id
       and e.level >= 2
     group by e.level
  )
  select
    g.level::integer,
    coalesce(pl.people, 0),
    coalesce(er.amount, 0)
  from generate_series(1, 19) as g(level)
  left join per_level pl on pl.level = g.level
  left join earnings er on er.level = g.level
  order by g.level;
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------

alter table public.milestone_pool enable row level security;
-- No policies: the pool is company money, server-only.

-- ---------------------------------------------------------------------------
-- 8. The earnings guard must respect the matrix level
-- ---------------------------------------------------------------------------

-- `jutaone_guard_earning` predates the matrix: it recomputes every split at the
-- referrer's flat `commission_bps` (7000 = 70%). With 19 levels that is wrong —
-- it overwrote a level-2 share of 4% with 70%, which the QA caught. The guard
-- now defers to `jutaone_level_bps(level)` for matrix rows and keeps the old
-- behaviour only for level-1 legacy rows written before levels existed.
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
  v_level_bps integer;
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

  -- Matrix rows carry their own level and the percentage that belongs to it.
  -- Recomputing from the code's flat bps would pay level 2+ the level-1 rate.
  v_level_bps := public.jutaone_level_bps(coalesce(new.level, 1));
  if v_level_bps > 0 then
    new.commission_bps := v_level_bps;
    new.affiliate_share_minor :=
      round(new.gross_minor::numeric * v_level_bps / 10000)::bigint;
    new.company_share_minor := new.gross_minor - new.affiliate_share_minor;
    new.updated_at := now();

    -- A rent row needs no further validation; a top-up row still must be paid.
    if new.rent_subscription_id is not null then
      return new;
    end if;
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
  new.commission_bps := v_level_bps;
  new.affiliate_share_minor := round(new.gross_minor::numeric * v_level_bps / 10000)::bigint;
  new.company_share_minor := new.gross_minor - new.affiliate_share_minor;
  new.updated_at := now();

  return new;
end $$;

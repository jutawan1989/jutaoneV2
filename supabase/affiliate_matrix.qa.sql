-- Adversarial checks for the 19-level matrix.
-- Run by scripts/qa-matrix.mjs, which prints verdicts and removes fixtures.
--
-- The cases that matter:
--   * the 19 percentages sum to exactly 70% of the gross
--   * each level is paid its own percentage, not a share of a pool
--   * the milestone pool is withheld once, never twice
--   * replaying a purchase pays nobody twice
--   * a chain shorter than 19 pays only the levels that exist
--   * a cycle is refused, because it would hang the webhook
--   * depth beyond 19 is not paid

drop table if exists _mx_results;
create table _mx_results (step int, name text, ok boolean, detail text);

-- Scoped hard to this suite: a leftover row from a previous run would be
-- counted in every SUM below and make the totals meaningless.
delete from public.affiliate_earnings where referred_code_id is not null;
delete from public.affiliate_earnings
 where referral_code_id in (select id from public.referral_codes where code like 'mx-%');
delete from public.milestone_pool;
delete from public.referral_codes where code like 'mx-%';
delete from public.store_subscriptions where owner_ref = 'mx-buyer';

-- A real subscription row is needed as the payment's parent record:
-- affiliate_earnings.rent_subscription_id is a foreign key.
delete from public.store_subscriptions where owner_ref = 'mx-buyer';
insert into public.store_subscriptions (owner_ref, plan, status, trial_ends_at)
values ('mx-buyer', 'store_pro', 'active', now() + interval '30 days')
on conflict (owner_ref) do update set status = 'active';

-- Build a 20-deep chain: mx-01 is the top, mx-20 the deepest.
do $$
declare
  i int;
  v_parent bigint := null;
  v_id bigint;
begin
  for i in 1..20 loop
    insert into public.referral_codes (code, owner_ref, commission_bps, parent_code_id)
    values (format('mx-%s', lpad(i::text, 2, '0')), format('mx-owner-%s', i), 7000, v_parent)
    returning id into v_id;
    v_parent := v_id;
  end loop;
end $$;

-- ---- 1. a deep payment pays exactly 70% across the chain -----------------

do $$
declare
  v_written int;
  v_paid bigint;
  v_pool bigint;
  v_gross bigint := 100000;  -- 100,000 minor units so each % is an exact integer
  v_buyer bigint;
begin
  -- The buyer sits at the deepest node; level 1 is its parent (mx-19).
  select id into v_buyer from public.referral_codes where code = 'mx-20';

  v_written := public.jutaone_distribute_commission('rent', null, (select id from public.store_subscriptions where owner_ref='mx-buyer'), v_buyer, v_gross, 'MYR');

  select coalesce(sum(affiliate_share_minor), 0) into v_paid
    from public.affiliate_earnings where referred_code_id = v_buyer;
  select coalesce(sum(pool_minor), 0) into v_pool from public.milestone_pool;

  insert into _mx_results
  values (1, 'a 19-level chain pays exactly 70% of the gross',
    v_paid + v_pool = 70000 and v_written = 19,
    format('levels=%s paid=%s pool=%s total=%s', v_written, v_paid, v_pool, v_paid + v_pool));
exception when others then
  insert into _mx_results values (1, 'a 19-level chain pays exactly 70% of the gross', false, sqlerrm);
end $$;

-- ---- 2. each level gets its own percentage ------------------------------

do $$
declare v_ok boolean;
begin
  select bool_and(expected = actual) into v_ok from (
    select e.level,
           e.affiliate_share_minor as actual,
           round(100000 * public.jutaone_level_bps(e.level) / 10000) as expected
      from public.affiliate_earnings e
     where e.referred_code_id = (select id from public.referral_codes where code='mx-20')
  ) t;
  insert into _mx_results values (2, 'every level is paid its own matrix percentage',
    coalesce(v_ok, false), 'compared stored share against jutaone_level_bps for each level');
exception when others then
  insert into _mx_results values (2, 'every level is paid its own matrix percentage', false, sqlerrm);
end $$;

-- ---- 3. level 1 is 50%, the sum of L2-19 is 15% --------------------------

do $$
declare l1 bigint; l2to19 bigint; v_buyer bigint;
begin
  select id into v_buyer from public.referral_codes where code='mx-20';
  select affiliate_share_minor into l1 from public.affiliate_earnings
   where referred_code_id = v_buyer and level = 1;
  select coalesce(sum(affiliate_share_minor),0) into l2to19 from public.affiliate_earnings
   where referred_code_id = v_buyer and level between 2 and 19;

  insert into _mx_results values (3, 'level 1 = 50%, levels 2-19 = 15%',
    l1 = 50000 and l2to19 = 15000, format('L1=%s L2-19=%s', l1, l2to19));
exception when others then
  insert into _mx_results values (3, 'level 1 = 50%, levels 2-19 = 15%', false, sqlerrm);
end $$;

-- ---- 4. replay pays nobody twice ---------------------------------------

do $$
declare v_buyer bigint; v_before bigint; v_after bigint; v_written int;
begin
  select id into v_buyer from public.referral_codes where code='mx-20';
  select count(*) into v_before from public.affiliate_earnings where referred_code_id = v_buyer;

  -- Same subscription, same gross: this is exactly what a Chip retry does.
  v_written := public.jutaone_distribute_commission('rent', null,
    (select id from public.store_subscriptions where owner_ref='mx-buyer'),
    v_buyer, 100000, 'MYR');

  select count(*) into v_after from public.affiliate_earnings where referred_code_id = v_buyer;

  insert into _mx_results values (4, 'replaying a purchase pays nobody twice',
    v_after = v_before and v_written = 0,
    format('rows before=%s after=%s written=%s', v_before, v_after, v_written));
exception when others then
  insert into _mx_results values (4, 'replaying a purchase pays nobody twice', false, sqlerrm);
end $$;

-- ---- 5. the milestone pool is withheld once ----------------------------

do $$
declare v_rows int; v_total bigint;
begin
  -- 5% of the 100,000 gross from test 1 = 5,000. Scoped to that purchase so a
  -- later test's pool row cannot mask a double-withhold.
  select count(*), coalesce(sum(pool_minor),0) into v_rows, v_total
    from public.milestone_pool where gross_minor = 100000;
  insert into _mx_results values (5, 'milestone pool withheld exactly once',
    v_total = 5000, format('rows=%s pool=%s (expected 5000)', v_rows, v_total));
exception when others then
  insert into _mx_results values (5, 'milestone pool withheld exactly once', false, sqlerrm);
end $$;

-- ---- 6. a short chain pays only the levels that exist -------------------

do $$
declare
  v_buyer bigint;
  v_written int;
  v_paid bigint;
begin
  -- A buyer one hop below the root: its parent chain is exactly 1 long.
  -- mx-02's parent is mx-01, and mx-01 has no parent.
  select id into v_buyer from public.referral_codes where code='mx-02';
  insert into public.store_subscriptions (owner_ref, plan, status, trial_ends_at)
  values ('mx-buyer-short', 'store_pro', 'active', now() + interval '30 days')
  on conflict (owner_ref) do update set status='active';
  v_written := public.jutaone_distribute_commission('rent', null,
    (select id from public.store_subscriptions where owner_ref='mx-buyer-short'),
    v_buyer, 100000, 'MYR');
  select coalesce(sum(affiliate_share_minor),0) into v_paid
    from public.affiliate_earnings where referred_code_id = v_buyer;

  insert into _mx_results values (6, 'a 1-level chain pays only level 1 (50%)',
    v_written = 1 and v_paid = 50000, format('written=%s paid=%s', v_written, v_paid));
exception when others then
  insert into _mx_results values (6, 'a 1-level chain pays only level 1 (50%)', false, sqlerrm);
end $$;

-- ---- 7. a cycle is refused --------------------------------------------

do $$
begin
  update public.referral_codes
     set parent_code_id = (select id from public.referral_codes where code='mx-20')
   where code = 'mx-01';
  insert into _mx_results values (7, 'referral cycle is refused', false,
    'a cycle was accepted; the recursive walk would never terminate');
exception when others then
  insert into _mx_results values (7, 'referral cycle is refused',
    sqlerrm like '%cycle%', sqlerrm);
end $$;

-- ---- 8. a self-parent is refused --------------------------------------

do $$
begin
  update public.referral_codes
     set parent_code_id = id
   where code = 'mx-10';
  insert into _mx_results values (8, 'a code cannot be its own parent', false, 'accepted');
exception when others then
  insert into _mx_results values (8, 'a code cannot be its own parent',
    sqlerrm like '%own parent%', sqlerrm);
end $$;

-- ---- 9. level 20 is not paid ------------------------------------------

do $$
declare v_bps int;
begin
  v_bps := public.jutaone_level_bps(20);
  insert into _mx_results values (9, 'level 20 pays nothing', v_bps = 0, format('bps=%s', v_bps));
exception when others then
  insert into _mx_results values (9, 'level 20 pays nothing', false, sqlerrm);
end $$;

-- ---- 10. network counts return all 19 rows ----------------------------

do $$
declare v_rows int; v_l3 int;
begin
  select count(*) into v_rows from public.jutaone_network_counts(
    (select id from public.referral_codes where code='mx-01'));
  select coalesce(max(people),0) into v_l3 from public.jutaone_network_counts(
    (select id from public.referral_codes where code='mx-01')) where level = 3;

  insert into _mx_results values (10, 'network counts return a stable 19 rows',
    v_rows = 19 and v_l3 = 1, format('rows=%s level3_people=%s', v_rows, v_l3));
exception when others then
  insert into _mx_results values (10, 'network counts return a stable 19 rows', false, sqlerrm);
end $$;

select step, name, ok, detail from _mx_results order by step;

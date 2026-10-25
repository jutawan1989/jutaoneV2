-- Adversarial checks for the Phase 2 affiliate schema.
-- Run against staging by `scripts/qa-affiliate.mjs`, which executes this file,
-- prints the collected verdicts, then deletes every row it created.
-- Every negative case below must FAIL for the right reason; a test that passes
-- because nothing was enforced is worse than no test at all.

drop table if exists _af_results;
create table _af_results (step int, name text, ok boolean, detail text);

-- ---- fixtures -------------------------------------------------------------

delete from public.affiliate_earnings where topup_id in (
  select id from public.topups where provider = 'qa-affiliate'
);
delete from public.payout_requests where referral_code_id in (
  select id from public.referral_codes where owner_ref = 'qa-owner'
);
delete from public.topups where provider = 'qa-affiliate';
delete from public.referral_codes where owner_ref = 'qa-owner';

insert into public.referral_codes (code, owner_ref, owner_visitor_key, commission_bps)
values ('qa-affiliate-01', 'qa-owner', repeat('a', 64), 7000);

insert into public.topups
  (provider, provider_id, reference, status, amount, currency, referral_code_id, buyer_visitor_key)
select 'qa-affiliate', 'qa-topup-paid', 'QA-1', 'paid', 300, 'MYR', id, repeat('b', 64)
from public.referral_codes where code = 'qa-affiliate-01';

insert into public.topups
  (provider, provider_id, reference, status, amount, currency, referral_code_id, buyer_visitor_key)
select 'qa-affiliate', 'qa-topup-unpaid', 'QA-2', 'pending', 300, 'MYR', id, repeat('b', 64)
from public.referral_codes where code = 'qa-affiliate-01';

insert into public.topups
  (provider, provider_id, reference, status, amount, currency, referral_code_id, buyer_visitor_key)
select 'qa-affiliate', 'qa-topup-self', 'QA-3', 'paid', 300, 'MYR', id, repeat('a', 64)
from public.referral_codes where code = 'qa-affiliate-01';

-- ---- 1. happy path: the trigger computes the 70/30 split ------------------

do $$
declare v record;
begin
  insert into public.affiliate_earnings (referral_code_id, topup_id, currency, gross_minor,
                                         commission_bps, affiliate_share_minor, company_share_minor)
  select rc.id, t.id, 'MYR', 999999, 9999, 999999, 0
  from public.referral_codes rc, public.topups t
  where rc.code = 'qa-affiliate-01' and t.provider_id = 'qa-topup-paid';

  select e.gross_minor, e.commission_bps, e.affiliate_share_minor, e.company_share_minor, e.status
    into v
    from public.affiliate_earnings e
    join public.topups t on t.id = e.topup_id
   where t.provider_id = 'qa-topup-paid';

  insert into _af_results
  values (1, 'trigger computes the split and ignores caller-supplied money',
          v.gross_minor = 300 and v.commission_bps = 7000
          and v.affiliate_share_minor = 210 and v.company_share_minor = 90
          and v.status = 'pending',
          format('stored gross=%s bps=%s affiliate=%s company=%s (caller sent gross=999999, bps=9999)',
                 v.gross_minor, v.commission_bps, v.affiliate_share_minor, v.company_share_minor));
exception when others then
  insert into _af_results values (1, 'trigger computes the split', false, sqlerrm);
end $$;

-- ---- 2. replaying the same top-up cannot pay twice ------------------------

do $$
begin
  insert into public.affiliate_earnings (referral_code_id, topup_id, currency, gross_minor,
                                         commission_bps, affiliate_share_minor, company_share_minor)
  select rc.id, t.id, 'MYR', 300, 7000, 210, 90
  from public.referral_codes rc, public.topups t
  where rc.code = 'qa-affiliate-01' and t.provider_id = 'qa-topup-paid';

  insert into _af_results values (2, 'duplicate earning for one top-up is rejected', false,
    'second insert was accepted — double credit is possible');
exception
  when unique_violation or raise_exception then
    insert into _af_results values (2, 'duplicate earning for one top-up is rejected', true, sqlerrm);
end $$;

-- ---- 3. an unpaid top-up cannot accrue commission -------------------------

do $$
begin
  insert into public.affiliate_earnings (referral_code_id, topup_id, currency, gross_minor,
                                         commission_bps, affiliate_share_minor, company_share_minor)
  select rc.id, t.id, 'MYR', 300, 7000, 210, 90
  from public.referral_codes rc, public.topups t
  where rc.code = 'qa-affiliate-01' and t.provider_id = 'qa-topup-unpaid';

  insert into _af_results values (3, 'unpaid top-up cannot accrue commission', false,
    'earning was recorded for a pending top-up');
exception when others then
  insert into _af_results values (3, 'unpaid top-up cannot accrue commission',
    sqlerrm like '%is not paid%', sqlerrm);
end $$;

-- ---- 4. self-referral is rejected ----------------------------------------

do $$
begin
  insert into public.affiliate_earnings (referral_code_id, topup_id, currency, gross_minor,
                                         commission_bps, affiliate_share_minor, company_share_minor)
  select rc.id, t.id, 'MYR', 300, 7000, 210, 90
  from public.referral_codes rc, public.topups t
  where rc.code = 'qa-affiliate-01' and t.provider_id = 'qa-topup-self';

  insert into _af_results values (4, 'self-referral is rejected', false,
    'affiliate earned on their own purchase');
exception when others then
  insert into _af_results values (4, 'self-referral is rejected',
    sqlerrm like '%self-referral%', sqlerrm);
end $$;

-- ---- 5. a payout cannot exceed the available balance ---------------------

do $$
begin
  insert into public.payout_requests (referral_code_id, currency, amount_minor, status)
  select rc.id, 'MYR', 500, 'requested'
  from public.referral_codes rc where rc.code = 'qa-affiliate-01';

  insert into _af_results values (5, 'payout above the available balance is rejected', false,
    'requested 500 against a 210 balance');
exception when others then
  insert into _af_results values (5, 'payout above the available balance is rejected',
    sqlerrm like '%exceeds available balance%', sqlerrm);
end $$;

-- ---- 6. an exact-balance payout settles and marks earnings paid ----------

do $$
declare
  v_payout bigint;
  v_status text;
  v_linked bigint;
  v_available bigint;
  v_paid bigint;
begin
  insert into public.payout_requests (referral_code_id, currency, amount_minor, status)
  select rc.id, 'MYR', 210, 'requested'
  from public.referral_codes rc where rc.code = 'qa-affiliate-01'
  returning id into v_payout;

  update public.payout_requests set status = 'approved' where id = v_payout;
  update public.payout_requests set status = 'paid' where id = v_payout;

  select e.status, e.payout_request_id into v_status, v_linked
    from public.affiliate_earnings e
    join public.topups t on t.id = e.topup_id
   where t.provider_id = 'qa-topup-paid';

  select available_minor, paid_minor into v_available, v_paid
    from public.affiliate_balances b
    join public.referral_codes rc on rc.id = b.referral_code_id
   where rc.code = 'qa-affiliate-01' and b.currency = 'MYR';

  insert into _af_results values (6, 'exact-balance payout consumes the earning',
    v_status = 'paid' and v_linked = v_payout and v_available = 0 and v_paid = 210,
    format('earning status=%s linked=%s available_after=%s paid_total=%s',
           v_status, v_linked, v_available, v_paid));
exception when others then
  insert into _af_results values (6, 'exact-balance payout consumes the earning', false, sqlerrm);
end $$;

-- ---- 7. after settlement no second payout can be requested ---------------

do $$
begin
  insert into public.payout_requests (referral_code_id, currency, amount_minor, status)
  select rc.id, 'MYR', 1, 'requested'
  from public.referral_codes rc where rc.code = 'qa-affiliate-01';

  insert into _af_results values (7, 'no payout after the balance is spent', false,
    'a second payout was accepted with zero available balance');
exception when others then
  insert into _af_results values (7, 'no payout after the balance is spent',
    sqlerrm like '%exceeds available balance%', sqlerrm);
end $$;

-- ---- 8. one open request reserves the balance ----------------------------

do $$
declare
  v_second bigint;
begin
  -- Undo the settlement so the balance is available again.
  update public.affiliate_earnings set status = 'approved', payout_request_id = null
    from public.topups t
   where t.id = affiliate_earnings.topup_id and t.provider_id = 'qa-topup-paid';
  delete from public.payout_requests where referral_code_id in
    (select id from public.referral_codes where code = 'qa-affiliate-01');

  insert into public.payout_requests (referral_code_id, currency, amount_minor, status)
  select rc.id, 'MYR', 200, 'requested'
  from public.referral_codes rc where rc.code = 'qa-affiliate-01';

  begin
    insert into public.payout_requests (referral_code_id, currency, amount_minor, status)
    select rc.id, 'MYR', 200, 'requested'
    from public.referral_codes rc where rc.code = 'qa-affiliate-01'
    returning id into v_second;

    insert into _af_results values (8, 'an open request reserves the balance', false,
      'two 200 requests were accepted against a 210 balance');
  exception when others then
    insert into _af_results values (8, 'an open request reserves the balance',
      sqlerrm like '%exceeds available balance%', sqlerrm);
  end;
exception when others then
  insert into _af_results values (8, 'an open request reserves the balance', false, sqlerrm);
end $$;

select step, name, ok, detail from _af_results order by step;

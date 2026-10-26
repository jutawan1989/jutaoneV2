-- Adversarial checks for the token ledger.
-- Run by `scripts/qa-ledger.mjs`, which executes this file, prints the verdicts
-- and removes every fixture it created.
--
-- The point is to prove the credit path cannot be abused without a real payment:
-- replayed webhooks, unpaid top-ups, negative debits and unbalanced rows must all
-- be refused by the database, not by the caller.

drop table if exists _tl_results;
create table _tl_results (step int, name text, ok boolean, detail text);

delete from public.token_ledger where visitor_key like 'qa-ledger-%';
delete from public.topups where provider = 'qa-ledger';

insert into public.topups (provider, provider_id, reference, status, amount, currency,
                           base_usd_cents, tokens_granted, visitor_key)
values
  ('qa-ledger', 'qa-tl-paid',   'QA-TL-1', 'paid',    1000, 'MYR', 100, 1000000, 'qa-ledger-buyer'),
  ('qa-ledger', 'qa-tl-unpaid', 'QA-TL-2', 'pending', 1000, 'MYR', 100, 1000000, 'qa-ledger-buyer');

-- ---- 1. a paid top-up credits exactly usd * 1,000,000 ---------------------

do $$
declare v_balance bigint; v_after bigint;
begin
  insert into public.token_ledger (visitor_key, delta, reason, topup_id, base_usd_cents, tokens)
  select t.visitor_key, 1000000, 'topup', t.id, 100, 1000000
    from public.topups t where t.provider_id = 'qa-tl-paid';

  select public.jutaone_token_balance('qa-ledger-buyer') into v_balance;
  select balance_after into v_after from public.token_ledger
   where visitor_key = 'qa-ledger-buyer' order by id desc limit 1;

  insert into _tl_results values (1, 'paid top-up credits the tokens',
    v_balance = 1000000 and v_after = 1000000,
    format('balance=%s balance_after=%s', v_balance, v_after));
exception when others then
  insert into _tl_results values (1, 'paid top-up credits the tokens', false, sqlerrm);
end $$;

-- ---- 2. replaying the same webhook cannot credit twice -------------------

do $$
begin
  insert into public.token_ledger (visitor_key, delta, reason, topup_id, base_usd_cents, tokens)
  select t.visitor_key, 1000000, 'topup', t.id, 100, 1000000
    from public.topups t where t.provider_id = 'qa-tl-paid';

  insert into _tl_results values (2, 'replayed webhook cannot double-credit', false,
    'second credit was accepted');
exception
  when unique_violation or raise_exception then
    insert into _tl_results values (2, 'replayed webhook cannot double-credit', true, sqlerrm);
end $$;

-- ---- 3. an unpaid top-up cannot grant tokens -----------------------------

do $$
begin
  insert into public.token_ledger (visitor_key, delta, reason, topup_id)
  select t.visitor_key, 1000000, 'topup', t.id
    from public.topups t where t.provider_id = 'qa-tl-unpaid';

  insert into _tl_results values (3, 'unpaid top-up cannot grant tokens', false,
    'a pending top-up was credited');
exception when others then
  insert into _tl_results values (3, 'unpaid top-up cannot grant tokens',
    sqlerrm like '%is not paid%', sqlerrm);
end $$;

-- ---- 4. a spend cannot overdraw the balance ------------------------------

do $$
begin
  insert into public.token_ledger (visitor_key, delta, reason)
  values ('qa-ledger-buyer', -2000000, 'spend');

  insert into _tl_results values (4, 'spend cannot overdraw the balance', false,
    'a negative balance was accepted');
exception when others then
  insert into _tl_results values (4, 'spend cannot overdraw the balance',
    sqlerrm like '%insufficient token balance%', sqlerrm);
end $$;

-- ---- 5. a legitimate spend reduces the running total ---------------------

do $$
declare v_balance bigint; v_after bigint;
begin
  insert into public.token_ledger (visitor_key, delta, reason)
  values ('qa-ledger-buyer', -400000, 'spend');

  select public.jutaone_token_balance('qa-ledger-buyer') into v_balance;
  select balance_after into v_after from public.token_ledger
   where visitor_key = 'qa-ledger-buyer' order by id desc limit 1;

  insert into _tl_results values (5, 'spend keeps the running balance consistent',
    v_balance = 600000 and v_after = 600000,
    format('balance=%s balance_after=%s', v_balance, v_after));
exception when others then
  insert into _tl_results values (5, 'spend keeps the running balance consistent', false, sqlerrm);
end $$;

-- ---- 6. a zero-delta row is meaningless and rejected ---------------------

do $$
begin
  insert into public.token_ledger (visitor_key, delta, reason)
  values ('qa-ledger-buyer', 0, 'adjustment');
  insert into _tl_results values (6, 'zero-delta row rejected', false, 'accepted');
exception when others then
  insert into _tl_results values (6, 'zero-delta row rejected',
    sqlerrm like '%token_ledger_delta_nonzero%' or sqlerrm like '%check constraint%', sqlerrm);
end $$;

-- ---- 7. only topup rows may reference a top-up ---------------------------

do $$
begin
  insert into public.token_ledger (visitor_key, delta, reason, topup_id)
  select 'qa-ledger-buyer', -1, 'spend', t.id
    from public.topups t where t.provider_id = 'qa-tl-paid';

  insert into _tl_results values (7, 'spend cannot reference a top-up', false,
    'a spend row pointed at a top-up');
exception when others then
  insert into _tl_results values (7, 'spend cannot reference a top-up',
    sqlerrm like '%only topup credits%', sqlerrm);
end $$;

-- ---- 8. balances are per visitor, not global -----------------------------

do $$
declare v_other bigint;
begin
  insert into public.token_ledger (visitor_key, delta, reason)
  values ('qa-ledger-other', 250000, 'signup_bonus');

  select public.jutaone_token_balance('qa-ledger-other') into v_other;

  insert into _tl_results values (8, 'balances are isolated per visitor',
    v_other = 250000
      and public.jutaone_token_balance('qa-ledger-buyer') = 600000,
    format('other=%s buyer=%s', v_other, public.jutaone_token_balance('qa-ledger-buyer')));
exception when others then
  insert into _tl_results values (8, 'balances are isolated per visitor', false, sqlerrm);
end $$;

select step, name, ok, detail from _tl_results order by step;

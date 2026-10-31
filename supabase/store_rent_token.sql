-- JutaOne.Biz — Store Rent paid in tokens (CTO directive).
--
-- Rent is a token deduction, never a card payment: POST /api/store/activate
-- charges 5,000,000 Token (reason 'store_rent') and sets
-- store_subscriptions status='active', paid_until = now + 30 days.
--
-- Why this file: the live `token_ledger_reason_valid` guard (see
-- token_manual_topup.sql) only accepts a closed set of reasons. Without this
-- migration, every rent activation fails on the reason check and the shop can
-- never activate. Apply BEFORE rent traffic: paste into the Supabase SQL editor
-- (Singapore project ddpqmdaqgztyezauuqwq).
--
-- Idempotent: safe to re-run.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'token_ledger_reason_valid'
  ) then
    alter table public.token_ledger drop constraint token_ledger_reason_valid;
  end if;
  alter table public.token_ledger
    add constraint token_ledger_reason_valid
    check (reason in ('topup', 'spend', 'store_rent', 'signup_bonus', 'adjustment', 'admin_manual_topup'));
end $$;

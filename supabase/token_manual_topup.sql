-- JutaOne.Biz — admin manual top-up reason
--
-- The live `token_ledger_reason_valid` guard only accepts a closed set of
-- reasons (`topup` additionally requires a Chip payment row via its guard
-- trigger, so an admin grant can never ride on it). Register
-- `admin_manual_topup` as a first-class grant reason so the audit trail reads
-- what actually happened instead of hiding behind `adjustment`.
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
    check (reason in ('topup', 'spend', 'signup_bonus', 'adjustment', 'admin_manual_topup'));
end $$;

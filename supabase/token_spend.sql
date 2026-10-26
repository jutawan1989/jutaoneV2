-- JutaOne.Biz — token spend idempotency for metered actions
--
-- Search costs 10,000 tokens only when it succeeds. A retried request (client
-- timeout, user double-click, proxy retry) must not charge twice for one search,
-- so a spend carries a caller-supplied reference and the database enforces it.
--
-- Rides on the existing token_ledger guard: the balance check, the overdraw
-- refusal and balance_after are already handled there. This only adds the
-- uniqueness that spend rows were missing.
--
-- Idempotent: safe to re-run.

alter table public.token_ledger
  add column if not exists spend_ref text;

-- One charge per reference. NULLs are distinct in Postgres, so grants
-- (topup/signup_bonus/adjustment) are unaffected and keep inserting freely.
create unique index if not exists token_ledger_spend_ref_key
  on public.token_ledger (spend_ref)
  where spend_ref is not null;

-- Spends must carry a reference so a retry is detectable; grants need none.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'token_ledger_spend_has_ref'
  ) then
    alter table public.token_ledger
      add constraint token_ledger_spend_has_ref
      check (reason <> 'spend' or spend_ref is not null);
  end if;
end $$;

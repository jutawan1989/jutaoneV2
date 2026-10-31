-- JutaOne.Biz — member settings (Tetapan Akaun)
-- Adds payout bank details to `members`. Idempotent: safe to re-run.

alter table public.members add column if not exists bank_name text;
alter table public.members add column if not exists account_no text;
alter table public.members add column if not exists account_holder text;

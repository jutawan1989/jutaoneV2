-- JutaOne.Biz — member accounts
--
-- The system has been identity-less by design: tokens, stores and the affiliate
-- tree are all keyed by a pseudonymous visitor hash, which is why a browser
-- update could lock a merchant out of their own dashboard.
--
-- This adds a real login without breaking that model: `members` maps an email to
-- the `owner_ref` that already owns the data, so nothing is migrated or
-- re-keyed. The hash keeps working for anonymous visitors; this is the account
-- layer on top for people who need to reach their earnings from any device.
--
-- Passwords are scrypt hashes with a per-user salt (see lib/auth/member.ts).
-- A plain hash would be a downgrade from the current salt-everything posture.
--
-- Idempotent: safe to re-run.

create table if not exists public.members (
  id bigserial primary key,
  -- The same opaque owner hash used by token_ledger, merchant_products,
  -- store_subscriptions and referral_codes. One member, one data identity.
  owner_ref text not null,
  email text not null,
  display_name text,
  -- `scrypt$N$salt$hash`. Never a plaintext or reversible value.
  password_hash text not null,
  role text not null default 'merchant',
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  constraint members_email_format check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint members_role_valid check (role in ('merchant', 'admin')),
  constraint members_email_length check (char_length(email) <= 254)
);

-- Case-insensitive uniqueness: `Boss@x.com` and `boss@x.com` are one account.
create unique index if not exists members_email_key on public.members (lower(email));
create unique index if not exists members_owner_key on public.members (owner_ref);
create index if not exists members_role_idx on public.members (role);

-- ---------------------------------------------------------------------------
-- Payout review support for the admin panel
-- ---------------------------------------------------------------------------

-- The admin needs to see who is asking for money. `payee_reference` already
-- points at the payee record; this view joins the code so a row is readable
-- without a second query in the UI.
create or replace view public.payout_queue as
select
  p.id,
  p.referral_code_id,
  rc.code,
  rc.owner_ref,
  p.currency,
  p.amount_minor,
  p.status,
  p.method,
  p.payee_reference,
  p.note,
  p.requested_at,
  p.decided_at,
  p.paid_at
from public.payout_requests p
join public.referral_codes rc on rc.id = p.referral_code_id
order by p.requested_at desc;

-- ---------------------------------------------------------------------------
-- RLS: server-only
-- ---------------------------------------------------------------------------

alter table public.members enable row level security;
-- No policies: passwords live here, so no client key may read this table.
-- The login route uses the service role and compares the hash server-side.

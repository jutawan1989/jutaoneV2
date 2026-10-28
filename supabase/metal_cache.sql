-- JutaOne.Biz — public metals cache (Goldprice.dev free tier)
--
-- The homepage widget shows free Goldprice.dev quotes, cached 4 hours so the
-- free quota is not burned on every page load. One row per display currency
-- (MYR / IDR). Written by the server with the service role key; RLS enabled
-- with no policies so anon/authenticated keys get no access.
--
-- Idempotent: safe to re-run.

create table if not exists public.metal_price_cache (
  currency text primary key,
  gold numeric,
  silver numeric,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default now(),
  constraint metal_price_cache_currency_format check (currency ~ '^[A-Z]{3}$')
);

alter table public.metal_price_cache enable row level security;

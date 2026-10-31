-- JutaOne.Biz — Waitlist & Lead Ads intake (Boss spec: Xiana / Meta / Make.com).
--
-- One table, two doors:
--   * `waitlist` — website form (Ali) + Make.com via POST /api/waitlist
--   * `leads`    — Meta Lead Ads (+ Make.com) via POST /api/lead-ads/meta,
--                  gated by LEAD_ADS_SECRET so outsiders cannot inject fakes
--
-- Idempotent: safe to re-run.
--
-- 1. waitlist ---------------------------------------------------------------

create table if not exists public.waitlist (
  id bigserial primary key,
  name text not null,
  email text,
  phone text,
  source text not null default 'website',
  created_at timestamptz not null default now(),
  constraint waitlist_name_present check (char_length(name) between 1 and 120),
  constraint waitlist_has_contact check (email is not null or phone is not null),
  constraint waitlist_email_format check (
    email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
);

create index if not exists waitlist_created_idx
  on public.waitlist (created_at desc);

create index if not exists waitlist_source_idx
  on public.waitlist (source);

-- 2. leads (Meta Lead Ads) ---------------------------------------------------

create table if not exists public.leads (
  id bigserial primary key,
  name text not null,
  email text,
  phone text,
  source text not null default 'meta_lead_ads',
  meta_lead_id text,
  meta_form_id text,
  meta_page_id text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint leads_name_present check (char_length(name) between 1 and 120),
  constraint leads_has_contact check (email is not null or phone is not null)
);

-- Meta retries the same lead on failure: one row per Meta lead id, so a
-- replay is an update of `raw` rather than a duplicate prospect.
create unique index if not exists leads_meta_lead_key
  on public.leads (meta_lead_id) where meta_lead_id is not null;

create index if not exists leads_created_idx
  on public.leads (created_at desc);

-- 3. RLS: server-only (service role writes; no client key access) -------------

alter table public.waitlist enable row level security;
alter table public.leads enable row level security;
-- No policies: both tables are written by the server with the service role key.

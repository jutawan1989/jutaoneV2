-- JutaOne.Biz — Biz-Match supplier directory
--
-- Linda's decision: do not couple the product to one government API. Data
-- arrives through an adapter (manual CSV, OpenCorporates, a local open-data
-- feed, seeds) and is normalised into one table, so adding or dropping a source
-- never touches the search or the UI.
--
-- `source` + `source_ref` make a row traceable to where it came from, and the
-- unique index on that pair makes re-importing the same feed idempotent instead
-- of duplicating every company.
--
-- `verified` is derived from the source, not typed by a human: an official
-- registry is verified, a CSV upload is not. The UI badge reads this column, so
-- a badge can never appear on unverified data by mistake.
--
-- Idempotent: safe to re-run.

create table if not exists public.supplier_directory (
  id bigserial primary key,
  company_name text not null,
  -- Normalised lowercase name for dedupe and prefix search.
  name_normalized text generated always as (lower(company_name)) stored,
  category text,
  location text,
  country text not null default 'MY',
  contact_info jsonb not null default '{}'::jsonb,
  website text,
  -- Where this row came from: 'seed', 'csv', 'opencorporates', 'opendata'.
  source text not null,
  -- The identifier inside that source, for idempotent re-imports.
  source_ref text,
  -- True only when the source is an official registry.
  verified boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_directory_name_length check (char_length(company_name) between 1 and 200),
  constraint supplier_directory_country_format check (country ~ '^[A-Z]{2}$'),
  constraint supplier_directory_source_valid
    check (source in ('seed', 'csv', 'opencorporates', 'opendata'))
);

-- Re-importing the same feed updates rather than duplicates.
-- A full constraint rather than a partial index: `ON CONFLICT (source,
-- source_ref)` requires a real unique constraint to match, and a WHERE clause
-- on the index makes it ineligible. NULLs are distinct in Postgres, so rows
-- without a source_ref still insert freely.
create unique index if not exists supplier_directory_source_ref_key
  on public.supplier_directory (source, source_ref);

-- The upsert target needs to be a constraint, which a plain index is not.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'supplier_directory_source_ref_uniq'
  ) then
    alter table public.supplier_directory
      add constraint supplier_directory_source_ref_uniq unique (source, source_ref);
  end if;
end $$;

-- Search paths the UI actually uses: by name, by category, by country.
create index if not exists supplier_directory_name_idx
  on public.supplier_directory (name_normalized text_pattern_ops);
create index if not exists supplier_directory_category_idx
  on public.supplier_directory (category, country) where active;
create index if not exists supplier_directory_country_idx
  on public.supplier_directory (country) where active;

-- Trigram-ish prefix search without an extension: `ILIKE 'x%'` uses the
-- text_pattern_ops index above, and a substring search falls back to a scan,
-- which is fine for this table's size. If it grows past ~100k rows, add pg_trgm.

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------

create or replace function public.jutaone_search_suppliers(
  p_query text default null,
  p_category text default null,
  p_country text default null,
  p_limit int default 30
)
returns setof public.supplier_directory
language sql
stable
as $$
  select *
    from public.supplier_directory
   where active
     and (p_query is null or p_query = '' or name_normalized like '%' || lower(p_query) || '%'
          or coalesce(category, '') ilike '%' || p_query || '%'
          or coalesce(location, '') ilike '%' || p_query || '%')
     and (p_category is null or p_category = '' or category = p_category)
     and (p_country is null or p_country = '' or country = p_country)
   -- Verified sources first, then alphabetical: a buyer looking for a supplier
   -- should see the ones with an official record before the imported ones.
   order by verified desc, name_normalized asc
   limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

-- ---------------------------------------------------------------------------
-- RLS: readable, not writable
-- ---------------------------------------------------------------------------

alter table public.supplier_directory enable row level security;

-- Deliberately no policy at all. The directory is read by our server (service
-- role) and written only by the import adapters. A public anon key can neither
-- read nor poison the directory: an unauthenticated write here would let anyone
-- insert a fake "verified" supplier.

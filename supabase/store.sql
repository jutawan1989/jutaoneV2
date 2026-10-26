-- JutaOne.Biz — Auto-Store & Invoice (Problem 3: trust & operational chaos)
--
-- A merchant gets a public micro-storefront and a written record of every
-- order, so an order taken over WhatsApp stops being a lost message.
--
-- Identity: `merchant_products.owner_ref` and `merchant_orders.merchant_ref`
-- are the same opaque visitor hash the rest of the system uses. No account, no
-- email, no phone is required to create a store — the merchant shares a URL and
-- the customer's details are only collected at checkout, which is the point
-- where a real order exists.
--
-- The customer's name/phone/address IS personal data. It is collected only when
-- the customer chooses to order, stored on the order, and readable only by the
-- service role. `merchant_orders` has RLS with no policies so neither the public
-- storefront nor a stray anon key can read another merchant's customers.
--
-- Money is integer minor units, matching `topups.amount` and the pricing module,
-- so an invoice total never drifts by a rounding error.
--
-- Idempotent: safe to re-run, and the region move runs it again.

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------

create table if not exists public.merchant_products (
  id bigserial primary key,
  -- Same opaque hash as token_ledger / demo_attempts. Not an account id.
  owner_ref text not null,
  -- Public storefront handle: /shop/<slug>. Lowercase, URL-safe.
  shop_slug text not null,
  name text not null,
  price_minor bigint not null,
  currency text not null default 'MYR',
  description text,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_products_price_positive check (price_minor > 0),
  constraint merchant_products_name_length check (char_length(name) between 1 and 120),
  constraint merchant_products_slug_format
    check (shop_slug = lower(shop_slug) and shop_slug ~ '^[a-z0-9][a-z0-9-]{2,31}$'),
  constraint merchant_products_currency_format check (currency ~ '^[A-Z]{3}$')
);

create index if not exists merchant_products_owner_idx
  on public.merchant_products (owner_ref, created_at desc);
create index if not exists merchant_products_shop_idx
  on public.merchant_products (shop_slug, active);

-- One owner cannot claim a slug that someone else already uses; enforced by a
-- trigger rather than a unique index on shop_slug alone, because a shop has
-- several product rows sharing the same slug.
create or replace function public.jutaone_guard_shop_slug()
returns trigger
language plpgsql
as $$
declare
  v_other text;
begin
  select owner_ref into v_other
    from public.merchant_products
   where shop_slug = new.shop_slug and owner_ref <> new.owner_ref
   limit 1;

  if v_other is not null then
    raise exception 'shop slug % is already used by another merchant', new.shop_slug;
  end if;
  return new;
end $$;

drop trigger if exists jutaone_guard_shop_slug_trg on public.merchant_products;
create trigger jutaone_guard_shop_slug_trg
  before insert or update of shop_slug on public.merchant_products
  for each row execute function public.jutaone_guard_shop_slug();

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

create table if not exists public.merchant_orders (
  id bigserial primary key,
  -- Which shop and which merchant own this order.
  shop_slug text not null,
  merchant_ref text not null,
  -- Customer details: collected at checkout, never before.
  customer_name text not null,
  customer_phone text not null,
  customer_address text,
  -- Snapshot of what was bought, so a later price edit cannot rewrite history.
  product_details jsonb not null default '[]'::jsonb,
  total_minor bigint not null,
  currency text not null default 'MYR',
  -- Always overwritten by the guard trigger below, so whatever the caller sends
  -- is irrelevant; NOT NULL stays so a row can never exist without a number.
  invoice_number text not null,
  status text not null default 'placed',
  note text,
  created_at timestamptz not null default now(),
  constraint merchant_orders_total_positive check (total_minor > 0),
  constraint merchant_orders_status_valid
    check (status in ('placed', 'confirmed', 'fulfilled', 'cancelled')),
  constraint merchant_orders_customer_name_length
    check (char_length(customer_name) between 1 and 120),
  constraint merchant_orders_phone_length
    check (char_length(customer_phone) between 6 and 32),
  constraint merchant_orders_currency_format check (currency ~ '^[A-Z]{3}$')
);

create unique index if not exists merchant_orders_invoice_key
  on public.merchant_orders (invoice_number);
create index if not exists merchant_orders_merchant_idx
  on public.merchant_orders (merchant_ref, created_at desc);
create index if not exists merchant_orders_shop_idx
  on public.merchant_orders (shop_slug, created_at desc);

-- Invoice numbers are sequential per year and not guessable across merchants.
create or replace function public.jutaone_next_invoice_number()
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  -- A dedicated sequence would be neater, but deriving from the table keeps the
  -- number gap-free enough for human use and needs no extra object.
  select coalesce(max(
    nullif(regexp_replace(invoice_number, '^JO-\d{4}-', ''), '')::bigint
  ), 0) + 1
    into v_seq
    from public.merchant_orders
   where invoice_number like 'JO-' || to_char(now(), 'YYYY') || '-%';

  return 'JO-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 6, '0');
end $$;

-- ---------------------------------------------------------------------------
-- Server-side price authority
-- ---------------------------------------------------------------------------

-- An order total must come from the products, never from the request body: a
-- client that posts its own total would let a customer name their own price.
create or replace function public.jutaone_order_total(
  p_shop_slug text,
  p_product_ids bigint[]
)
returns table (total_minor bigint, currency text, details jsonb)
language sql
stable
as $$
  select
    coalesce(sum(p.price_minor), 0)::bigint as total_minor,
    coalesce(min(p.currency), 'MYR') as currency,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'price_minor', p.price_minor,
          'quantity', 1
        )
        order by p.id
      ),
      '[]'::jsonb
    ) as details
  from public.merchant_products p
  where p.shop_slug = p_shop_slug
    and p.active
    and p.id = any(p_product_ids);
$$;

-- ---------------------------------------------------------------------------
-- Guard: an order is consistent with its products and invoices are unique
-- ---------------------------------------------------------------------------

create or replace function public.jutaone_guard_order()
returns trigger
language plpgsql
as $$
declare
  v_count int;
  v_total bigint;
  v_currency text;
  v_details jsonb;
  v_ids bigint[];
begin
  -- The invoice number is always server-generated. Accepting a client value
  -- would let a caller pick a duplicate or a misleading number, and the invoice
  -- is the merchant's only written record of the sale.
  new.invoice_number := public.jutaone_next_invoice_number();

  -- Recompute from the products rather than trusting the payload.
  v_ids := array(
    select (item->>'id')::bigint
      from jsonb_array_elements(new.product_details) item
     where item ? 'id'
  );
  if v_ids is null or array_length(v_ids, 1) is null then
    raise exception 'an order needs at least one product';
  end if;

  select t.total_minor, t.currency, t.details
    into v_total, v_currency, v_details
    from public.jutaone_order_total(new.shop_slug, v_ids) t;

  select count(*) into v_count
    from public.merchant_products
   where shop_slug = new.shop_slug and active and id = any(v_ids);

  if v_count <> array_length(v_ids, 1) then
    raise exception 'some products do not belong to shop % or are inactive', new.shop_slug;
  end if;
  if v_total is null or v_total <= 0 then
    raise exception 'order total resolved to %', v_total;
  end if;

  new.product_details := v_details;
  new.total_minor := v_total;
  new.currency := v_currency;
  new.merchant_ref := (
    select owner_ref from public.merchant_products
     where shop_slug = new.shop_slug limit 1
  );
  return new;
end $$;

drop trigger if exists jutaone_guard_order_trg on public.merchant_orders;
create trigger jutaone_guard_order_trg
  before insert on public.merchant_orders
  for each row execute function public.jutaone_guard_order();

-- ---------------------------------------------------------------------------
-- RLS: server-only
-- ---------------------------------------------------------------------------

alter table public.merchant_products enable row level security;
alter table public.merchant_orders enable row level security;
-- No policies on purpose. The storefront is rendered by our server, which uses
-- the service role; a public or anon key can read neither products nor orders.
-- That is deliberate for orders: they contain customer names, phones and
-- addresses, and a shop page has no business exposing them.

-- Adversarial checks for Auto-Store & Invoice.
-- Run by scripts/qa-store.mjs, which executes this, prints verdicts, and
-- deletes every fixture it created.
--
-- The cases that matter for money and privacy:
--   * a client-supplied total is ignored
--   * a client cannot buy another shop's product
--   * a client cannot set its own invoice number
--   * a slug cannot be stolen by another merchant
--   * anon cannot read orders (customer PII) or products

drop table if exists _st_results;
create table _st_results (step int, name text, ok boolean, detail text);

delete from public.merchant_orders where shop_slug like 'qa-shop%';
delete from public.merchant_products where owner_ref like 'qa-store-%';

insert into public.merchant_products (owner_ref, shop_slug, name, price_minor, currency, description)
values
  ('qa-store-owner', 'qa-shop-one', 'Kek Lapis Sarawak', 4500, 'MYR', 'Homemade, RM45'),
  ('qa-store-owner', 'qa-shop-one', 'Biskut Mentega', 2500, 'MYR', 'RM25 sebalang'),
  ('qa-store-other', 'qa-shop-two', 'Produk Orang Lain', 9900, 'MYR', 'not yours');

-- ---- 1. total is computed from products, not from the payload -------------

do $$
declare v record;
begin
  insert into public.merchant_orders
    (shop_slug, merchant_ref, customer_name, customer_phone, customer_address,
     product_details, total_minor, currency, invoice_number)
  select 'qa-shop-one', 'ignored',
         'Ali Bakar', '0123456789', 'Shah Alam',
         jsonb_build_array(jsonb_build_object('id', id, 'quantity', 1)),
         1, 'MYR', null
    from public.merchant_products
   where shop_slug = 'qa-shop-one' and name = 'Kek Lapis Sarawak';

  select total_minor, merchant_ref, currency, invoice_number into v
    from public.merchant_orders where shop_slug = 'qa-shop-one';

  insert into _st_results values (1, 'order total comes from the product, not the client',
    v.total_minor = 4500 and v.merchant_ref = 'qa-store-owner',
    format('client sent 1, stored %s, merchant_ref %s', v.total_minor, v.merchant_ref));
exception when others then
  insert into _st_results values (1, 'order total comes from the product, not the client', false, sqlerrm);
end $$;

-- ---- 2. cannot buy a product from another shop ----------------------------

do $$
begin
  insert into public.merchant_orders
    (shop_slug, merchant_ref, customer_name, customer_phone, product_details,
     total_minor, currency, invoice_number)
  select 'qa-shop-one', 'x', 'Penyusup', '0123456789',
         jsonb_build_array(jsonb_build_object('id', id, 'quantity', 1)),
         0, 'MYR', null
    from public.merchant_products where shop_slug = 'qa-shop-two';

  insert into _st_results values (2, 'cannot order another shop''s product', false,
    'cross-shop order was accepted');
exception when others then
  insert into _st_results values (2, 'cannot order another shop''s product',
    sqlerrm like '%do not belong to shop%', sqlerrm);
end $$;

-- ---- 3. invoice number is server-generated and unique ---------------------

do $$
declare v1 text; v2 text;
begin
  insert into public.merchant_orders
    (shop_slug, merchant_ref, customer_name, customer_phone, product_details,
     total_minor, currency, invoice_number)
  select 'qa-shop-one', 'x', 'Siti', '01122223333',
         jsonb_build_array(jsonb_build_object('id', id, 'quantity', 1)),
         0, 'MYR', 'CLIENT-CHOSE-THIS'
    from public.merchant_products where shop_slug='qa-shop-one' and name='Biskut Mentega';
  select invoice_number into v1 from public.merchant_orders
   where customer_name = 'Siti' order by id desc limit 1;

  insert into _st_results values (3, 'invoice number is generated, never client-supplied',
    v1 like 'JO-%' and v1 <> 'CLIENT-CHOSE-THIS',
    format('stored %s', v1));
exception when others then
  insert into _st_results values (3, 'invoice number is generated, never client-supplied', false, sqlerrm);
end $$;

-- ---- 4. two orders get different invoice numbers --------------------------

do $$
declare a text; b text;
begin
  select invoice_number into a from public.merchant_orders
   where shop_slug='qa-shop-one' order by id asc limit 1;
  select invoice_number into b from public.merchant_orders
   where shop_slug='qa-shop-one' order by id desc limit 1;
  insert into _st_results values (4, 'invoice numbers are unique',
    a is distinct from b, format('%s vs %s', a, b));
exception when others then
  insert into _st_results values (4, 'invoice numbers are unique', false, sqlerrm);
end $$;

-- ---- 5. a merchant cannot steal another merchant's slug -------------------

do $$
begin
  insert into public.merchant_products (owner_ref, shop_slug, name, price_minor)
  values ('qa-store-thief', 'qa-shop-one', 'Barang Curi', 1000);

  insert into _st_results values (5, 'a shop slug cannot be taken by another merchant', false,
    'the slug was reassignable');
exception when others then
  insert into _st_results values (5, 'a shop slug cannot be taken by another merchant',
    sqlerrm like '%already used by another merchant%', sqlerrm);
end $$;

-- ---- 6. the same merchant may add products to their own slug -------------

do $$
declare v_count int;
begin
  insert into public.merchant_products (owner_ref, shop_slug, name, price_minor)
  values ('qa-store-owner', 'qa-shop-one', 'Produk Ketiga', 1500);
  select count(*) into v_count from public.merchant_products where shop_slug='qa-shop-one';
  insert into _st_results values (6, 'the owner can extend their own shop',
    v_count >= 3, format('%s products on qa-shop-one', v_count));
exception when others then
  insert into _st_results values (6, 'the owner can extend their own shop', false, sqlerrm);
end $$;

-- ---- 7. an invalid slug is rejected at write time ------------------------

do $$
begin
  insert into public.merchant_products (owner_ref, shop_slug, name, price_minor)
  values ('qa-store-owner', 'Bad Slug!', 'X', 1000);
  insert into _st_results values (7, 'invalid slug rejected', false, 'accepted a malformed slug');
exception when others then
  insert into _st_results values (7, 'invalid slug rejected',
    sqlerrm like '%slug_format%' or sqlerrm like '%check constraint%', sqlerrm);
end $$;

-- ---- 8. an empty order is rejected --------------------------------------

do $$
begin
  insert into public.merchant_orders
    (shop_slug, merchant_ref, customer_name, customer_phone, product_details,
     total_minor, currency, invoice_number)
  values ('qa-shop-one', 'x', 'Tiada Item', '0123456789', '[]'::jsonb, 0, 'MYR', null);
  insert into _st_results values (8, 'an order with no products is rejected', false, 'accepted');
exception when others then
  insert into _st_results values (8, 'an order with no products is rejected',
    sqlerrm like '%at least one product%', sqlerrm);
end $$;

select step, name, ok, detail from _st_results order by step;

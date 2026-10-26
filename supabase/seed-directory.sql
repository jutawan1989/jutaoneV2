-- Sample suppliers so Biz-Match is not an empty page while a real source is
-- connected. Everything here is `source='seed'` and `verified=false`: none of
-- it comes from a registry, and the UI badge must not claim otherwise.
--
-- Idempotent: the (source, source_ref) unique index makes a re-run an update.

insert into public.supplier_directory
  (company_name, category, location, country, contact_info, website, source, source_ref, verified)
values
  -- Malaysia
  ('Selangor Packaging Supply', 'Packaging', 'Shah Alam, Selangor', 'MY',
   '{"phone":"+60355667788","email":"sales@selangorpack.example"}', 'https://selangorpack.example', 'seed', 'seed-my-001', false),
  ('Kuala Lumpur Print Works', 'Printing', 'Cheras, Kuala Lumpur', 'MY',
   '{"phone":"+60399887766","email":"hello@klprint.example"}', 'https://klprint.example', 'seed', 'seed-my-002', false),
  ('Penang Food Ingredients', 'Food Supply', 'Bayan Lepas, Pulau Pinang', 'MY',
   '{"phone":"+60422334455","email":"order@penangfood.example"}', null, 'seed', 'seed-my-003', false),
  ('Johor Textile Trading', 'Textiles', 'Johor Bahru, Johor', 'MY',
   '{"phone":"+60733445566","email":"sales@johortex.example"}', 'https://johortex.example', 'seed', 'seed-my-004', false),
  ('Ipoh Coffee Roasters', 'Beverages', 'Ipoh, Perak', 'MY',
   '{"phone":"+60555667788","email":"roast@ipohcoffee.example"}', 'https://ipohcoffee.example', 'seed', 'seed-my-005', false),
  ('Kota Kinabalu Seafood Co', 'Food Supply', 'Kota Kinabalu, Sabah', 'MY',
   '{"phone":"+6088776655","email":"fresh@kkseafood.example"}', null, 'seed', 'seed-my-006', false),
  ('Kuching Handicraft Hub', 'Handicraft', 'Kuching, Sarawak', 'MY',
   '{"phone":"+6082334455","email":"craft@kuchinghub.example"}', 'https://kuchinghub.example', 'seed', 'seed-my-007', false),
  ('Melaka Cold Chain Logistics', 'Logistics', 'Melaka Tengah, Melaka', 'MY',
   '{"phone":"+6062233445","email":"ops@melakacold.example"}', null, 'seed', 'seed-my-008', false),
  ('Shah Alam Plastics Manufacturing', 'Manufacturing', 'Shah Alam, Selangor', 'MY',
   '{"phone":"+60377889900","email":"mfg@saplastics.example"}', 'https://saplastics.example', 'seed', 'seed-my-009', false),
  ('Seremban Agro Suppliers', 'Agriculture', 'Seremban, Negeri Sembilan', 'MY',
   '{"phone":"+6066677889","email":"agro@seremban.example"}', null, 'seed', 'seed-my-010', false),
  ('Kuantan Uniform Tailor', 'Apparel', 'Kuantan, Pahang', 'MY',
   '{"phone":"+6095556677","email":"tailor@kuantanon.example"}', null, 'seed', 'seed-my-011', false),
  ('Alor Setar Hardware Trading', 'Hardware', 'Alor Setar, Kedah', 'MY',
   '{"phone":"+6047778899","email":"sales@ashardware.example"}', 'https://ashardware.example', 'seed', 'seed-my-012', false),

  -- Indonesia
  ('Jakarta Packaging Jaya', 'Packaging', 'Jakarta Selatan, DKI Jakarta', 'ID',
   '{"phone":"+622155667788","email":"sales@jakartapack.example"}', 'https://jakartapack.example', 'seed', 'seed-id-001', false),
  ('Bandung Fashion Konveksi', 'Textiles', 'Bandung, Jawa Barat', 'ID',
   '{"phone":"+622244556677","email":"order@bandungfashion.example"}', 'https://bandungfashion.example', 'seed', 'seed-id-002', false),
  ('Surabaya Bahan Kue', 'Food Supply', 'Surabaya, Jawa Timur', 'ID',
   '{"phone":"+623133445566","email":"bahan@surabayakue.example"}', null, 'seed', 'seed-id-003', false),
  ('Medan Kopi Nusantara', 'Beverages', 'Medan, Sumatera Utara', 'ID',
   '{"phone":"+626122334455","email":"kopi@medannusantara.example"}', 'https://medannusantara.example', 'seed', 'seed-id-004', false),
  ('Yogyakarta Batik Craft', 'Handicraft', 'Yogyakarta, DI Yogyakarta', 'ID',
   '{"phone":"+622744556633","email":"batik@yogyacraft.example"}', 'https://yogyacraft.example', 'seed', 'seed-id-005', false),
  ('Semarang Frozen Food', 'Food Supply', 'Semarang, Jawa Tengah', 'ID',
   '{"phone":"+622433445522","email":"frozen@semarangfood.example"}', null, 'seed', 'seed-id-006', false),
  ('Makassar Logistik Laut', 'Logistics', 'Makassar, Sulawesi Selatan', 'ID',
   '{"phone":"+624133445511","email":"ops@makassarlog.example"}', null, 'seed', 'seed-id-007', false),
  ('Denpasar Souvenir Supplier', 'Handicraft', 'Denpasar, Bali', 'ID',
   '{"phone":"+623622334400","email":"souvenir@denpasarsup.example"}', 'https://denpasarsup.example', 'seed', 'seed-id-008', false),
  ('Tangerang Plastik Industri', 'Manufacturing', 'Tangerang, Banten', 'ID',
   '{"phone":"+622155667744","email":"mfg@tangerangplastik.example"}', 'https://tangerangplastik.example', 'seed', 'seed-id-009', false),
  ('Bogor Sayur Segar', 'Agriculture', 'Bogor, Jawa Barat', 'ID',
   '{"phone":"+622511223344","email":"segar@bogorsayur.example"}', null, 'seed', 'seed-id-010', false),
  ('Palembang Kain Tenun', 'Textiles', 'Palembang, Sumatera Selatan', 'ID',
   '{"phone":"+627113344556","email":"tenun@palembang.example"}', null, 'seed', 'seed-id-011', false),
  ('Balikpapan Safety Equipment', 'Hardware', 'Balikpapan, Kalimantan Timur', 'ID',
   '{"phone":"+625422334455","email":"safety@balikpapan.example"}', 'https://balikpapan-safety.example', 'seed', 'seed-id-012', false),
  ('Batam Elektronik Supply', 'Manufacturing', 'Batam, Kepulauan Riau', 'ID',
   '{"phone":"+627784556677","email":"supply@batamelektronik.example"}', 'https://batamelektronik.example', 'seed', 'seed-id-013', false)
on conflict (source, source_ref) do update
  set company_name = excluded.company_name,
      category     = excluded.category,
      location     = excluded.location,
      country      = excluded.country,
      contact_info = excluded.contact_info,
      website      = excluded.website,
      updated_at   = now();

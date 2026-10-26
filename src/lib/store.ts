import { getSupabase } from "@/lib/db";

/**
 * Data access for the micro-storefront.
 *
 * Every function here is server-only: it uses the service role key, which
 * bypasses RLS. Nothing in this module may be imported from a client component.
 */

export type Product = {
  id: number;
  name: string;
  price_minor: number;
  currency: string;
  description: string | null;
  image_url: string | null;
};

export type ShopInfo = {
  slug: string;
  products: Product[];
};

/**
 * Whether a shop is open, by subscription entitlement.
 *
 * A shop with no subscription row is treated as open: stores created before
 * Store Rent existed must not vanish. A shop whose trial lapsed or whose
 * subscription is cancelled is closed.
 */
export async function shopEntitlement(
  slug: string,
): Promise<{ isOpen: boolean; ownerRef: string | null; status: string }> {
  const db = getSupabase();
  if (!db || !isValidSlug(slug)) return { isOpen: false, ownerRef: null, status: "unknown" };

  const { data, error } = await db.rpc("jutaone_shop_status", { p_slug: slug });
  if (error || !data || data.length === 0) {
    // No products at all means the shop does not exist.
    return { isOpen: false, ownerRef: null, status: "missing" };
  }

  const row = data[0] as { owner_ref: string; is_open: boolean; status: string };
  return { isOpen: row.is_open, ownerRef: row.owner_ref, status: row.status };
}

const SLUG = /^[a-z0-9][a-z0-9-]{2,31}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG.test(slug);
}

/** Products for a public storefront. Inactive products are hidden. */
export async function getShopProducts(slug: string): Promise<Product[]> {
  const db = getSupabase();
  if (!db || !isValidSlug(slug)) return [];

  const { data, error } = await db
    .from("merchant_products")
    .select("id, name, price_minor, currency, description, image_url")
    .eq("shop_slug", slug)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[jutaone] shop lookup failed", error.message);
    return [];
  }
  return (data ?? []) as Product[];
}

/**
 * The public storefront shows no customer data and no merchant identity beyond
 * the slug. `owner_ref` is never selected.
 */
export async function shopExists(slug: string): Promise<boolean> {
  const db = getSupabase();
  if (!db || !isValidSlug(slug)) return false;

  const { count, error } = await db
    .from("merchant_products")
    .select("id", { count: "exact", head: true })
    .eq("shop_slug", slug);

  if (error) return false;
  return (count ?? 0) > 0;
}

export type CreateOrderInput = {
  shopSlug: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string | null;
  productIds: number[];
  note?: string | null;
};

export type CreatedOrder = {
  invoice_number: string;
  total_minor: number;
  currency: string;
  product_details: Array<{ id: number; name: string; price_minor: number; quantity: number }>;
};

/**
 * Creates an order.
 *
 * The total and the invoice number are computed by the database guard, not
 * here: `total_minor` is derived from the product rows and `invoice_number` is
 * always overwritten. A caller cannot name its own price or invoice number even
 * if it tries, which is why those fields are not parameters.
 */
export async function createOrder(
  input: CreateOrderInput,
): Promise<{ ok: true; order: CreatedOrder } | { ok: false; reason: string }> {
  const db = getSupabase();
  if (!db) return { ok: false, reason: "supabase_not_configured" };
  if (!isValidSlug(input.shopSlug)) return { ok: false, reason: "invalid_shop" };
  if (input.productIds.length === 0) return { ok: false, reason: "no_products" };

  const { data, error } = await db
    .from("merchant_orders")
    .insert({
      shop_slug: input.shopSlug,
      merchant_ref: "pending",
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      customer_address: input.customerAddress ?? null,
      product_details: input.productIds.map((id) => ({ id, quantity: 1 })),
      // Placeholders: the guard overwrites both. Sending 0 keeps the intent
      // visible — this value is never trusted.
      total_minor: 0,
      currency: "MYR",
      invoice_number: "",
      note: input.note ?? null,
    })
    .select("invoice_number, total_minor, currency, product_details")
    .single();

  if (error) {
    console.error("[jutaone] order insert failed", error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true, order: data as CreatedOrder };
}

export type MerchantOrder = CreatedOrder & {
  id: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string | null;
  status: string;
  created_at: string;
};

/** Orders for one merchant, keyed by the same opaque hash. */
export async function getMerchantOrders(ownerRef: string): Promise<MerchantOrder[]> {
  const db = getSupabase();
  if (!db) return [];

  const { data, error } = await db
    .from("merchant_orders")
    .select(
      "id, invoice_number, total_minor, currency, product_details, customer_name, customer_phone, customer_address, status, created_at",
    )
    .eq("merchant_ref", ownerRef)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return [];
  return (data ?? []) as MerchantOrder[];
}

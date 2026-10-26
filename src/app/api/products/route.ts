import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { isValidSlug } from "@/lib/store";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME = 120;
const MAX_DESCRIPTION = 500;
const MAX_PRICE_MINOR = 100_000_00; // RM100,000 in sen — a typo guard, not a policy.

type Body = {
  name?: unknown;
  price?: unknown;
  description?: unknown;
  image_url?: unknown;
  shop_slug?: unknown;
};

/**
 * Creates a product for the calling merchant.
 *
 * The merchant is identified by the same pseudonymous visitor hash used
 * everywhere else, so adding a product needs no account. That also means the
 * hash is the authorisation boundary: it is derived server-side and cannot be
 * supplied by the client, so one merchant cannot post products into another
 * merchant's shop.
 */
export async function POST(request: NextRequest) {
  const db = getSupabase();
  if (!db) {
    return NextResponse.json({ code: "store_unavailable" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > MAX_NAME) {
    return NextResponse.json({ code: "name_invalid", max: MAX_NAME }, { status: 400 });
  }

  const description =
    typeof body?.description === "string" ? body.description.trim().slice(0, MAX_DESCRIPTION) : null;

  // Price arrives in major units (e.g. 45.00) and is stored in minor units.
  const priceMajor = typeof body?.price === "number" ? body.price : Number(body?.price);
  if (!Number.isFinite(priceMajor) || priceMajor <= 0) {
    return NextResponse.json({ code: "price_invalid" }, { status: 400 });
  }
  const priceMinor = Math.round(priceMajor * 100);
  if (priceMinor <= 0 || priceMinor > MAX_PRICE_MINOR) {
    return NextResponse.json({ code: "price_out_of_range" }, { status: 400 });
  }

  const slug = typeof body?.shop_slug === "string" ? body.shop_slug.trim().toLowerCase() : "";
  if (!isValidSlug(slug)) {
    return NextResponse.json({ code: "shop_slug_invalid" }, { status: 400 });
  }

  // Only an absolute https URL is accepted: a relative path would be resolved
  // against our origin, and a javascript: URL would be stored XSS.
  const imageUrl =
    typeof body?.image_url === "string" && body.image_url.trim() !== ""
      ? body.image_url.trim()
      : null;
  if (imageUrl && !isSafeImageUrl(imageUrl)) {
    return NextResponse.json({ code: "image_url_invalid" }, { status: 400 });
  }

  const owner = identifyVisitor(request.headers).visitorKey;

  const { data, error } = await db
    .from("merchant_products")
    .insert({
      owner_ref: owner,
      shop_slug: slug,
      name,
      price_minor: priceMinor,
      currency: "MYR",
      description,
      image_url: imageUrl,
      active: true,
    })
    .select("id, name, price_minor, currency, description, image_url, shop_slug")
    .single();

  if (error) {
    // The slug trigger raises a readable message when another merchant owns it.
    const taken = /already used by another merchant/i.test(error.message);
    return NextResponse.json(
      { code: taken ? "shop_slug_taken" : "product_create_failed" },
      { status: taken ? 409 : 500 },
    );
  }

  return NextResponse.json({ ok: true, product: data }, { status: 201 });
}

function isSafeImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

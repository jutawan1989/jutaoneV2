import { NextResponse, type NextRequest } from "next/server";
import { createOrder } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME = 120;
const MAX_PHONE = 32;
const MAX_ADDRESS = 300;

type Body = {
  shop_slug?: unknown;
  customer_name?: unknown;
  customer_phone?: unknown;
  customer_address?: unknown;
  product_ids?: unknown;
  note?: unknown;
};

/**
 * Places an order on a micro-storefront.
 *
 * The client sends which products it wants, never the price or the invoice
 * number: the database guard derives both from the product rows. A caller that
 * posts its own total is ignored rather than trusted.
 *
 * Customer details are only collected here, at the point of a real order, which
 * keeps the "no PII before a transaction" position intact.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null;

  const shopSlug = typeof body?.shop_slug === "string" ? body.shop_slug.trim().toLowerCase() : "";
  if (!shopSlug) {
    return NextResponse.json({ code: "shop_slug_invalid" }, { status: 400 });
  }

  const customerName = typeof body?.customer_name === "string" ? body.customer_name.trim() : "";
  if (customerName.length < 1 || customerName.length > MAX_NAME) {
    return NextResponse.json({ code: "customer_name_invalid" }, { status: 400 });
  }

  const customerPhone = typeof body?.customer_phone === "string" ? body.customer_phone.trim() : "";
  // Deliberately loose: Malaysian and Indonesian numbers differ in formatting,
  // and rejecting a valid number is worse than accepting an odd one.
  if (customerPhone.length < 6 || customerPhone.length > MAX_PHONE || !/^[\d+\-\s()]+$/.test(customerPhone)) {
    return NextResponse.json({ code: "customer_phone_invalid" }, { status: 400 });
  }

  const customerAddress =
    typeof body?.customer_address === "string"
      ? body.customer_address.trim().slice(0, MAX_ADDRESS)
      : null;

  const productIds = Array.isArray(body?.product_ids)
    ? body.product_ids
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : [];
  if (productIds.length === 0) {
    return NextResponse.json({ code: "no_products" }, { status: 400 });
  }
  // A cart larger than this is a bot or a mistake; the storefront does not
  // offer it.
  if (productIds.length > 20) {
    return NextResponse.json({ code: "too_many_products" }, { status: 400 });
  }

  const result = await createOrder({
    shopSlug,
    customerName,
    customerPhone,
    customerAddress,
    productIds,
    note: typeof body?.note === "string" ? body.note.slice(0, 300) : null,
  });

  if (!result.ok) {
    const invalid = /do not belong to shop|at least one product|invalid_shop/i.test(result.reason);
    return NextResponse.json(
      { code: invalid ? "order_invalid" : "order_failed" },
      { status: invalid ? 400 : 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      invoiceNumber: result.order.invoice_number,
      total: result.order.total_minor / 100,
      currency: result.order.currency,
      items: result.order.product_details,
    },
    { status: 201 },
  );
}

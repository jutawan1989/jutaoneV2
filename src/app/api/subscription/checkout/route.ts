import { NextResponse, type NextRequest } from "next/server";
import { chipConfigured } from "@/lib/payment/chip";
import { getSubscription } from "@/lib/subscription";
import { identifyVisitor } from "@/lib/trial/visitor";

/**
 * Chip's hosted checkout only accepts English; `ms`/`id` return
 * 400 "not a valid choice". Rent is always billed in English on the gateway.
 */
const CHIP_LANGUAGE = "en";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opens a Chip checkout for $5.00 of Store Rent.
 *
 * Kept separate from `/api/topup`: a rent payment must not be confused with a
 * token purchase, since one grants tokens and the other extends a subscription.
 * Charged in MYR for the same reason top-ups are — FPX and DuitNow are the rails
 * a Malaysian merchant actually uses.
 */
const RENT_USD_CENTS = 500;
const MYR_PER_USD = 4.7;

export async function POST(request: NextRequest) {
  const owner = identifyVisitor(request.headers).visitorKey;

  const existing = await getSubscription(owner);
  if (existing && existing.status === "active" && existing.isOpen) {
    return NextResponse.json({ code: "already_active" }, { status: 409 });
  }

  if (!chipConfigured()) {
    // No gateway configured: the trial is the only path, and saying so is more
    // useful than a generic failure.
    return NextResponse.json({ code: "chip_unavailable" }, { status: 503 });
  }

  const amountMinor = Math.round((RENT_USD_CENTS / 100) * MYR_PER_USD * 100);
  const reference = `JO-RENT-${Date.now().toString(36).toUpperCase()}`;
  const origin = request.nextUrl.origin;

  try {
    const response = await fetch(
      `${(process.env.CHIP_API_BASE_URL || "https://gate.chip-in.asia/api/v1").replace(/\/$/, "")}/purchases/`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.CHIP_API_KEY}`,
        },
        body: JSON.stringify({
          brand_id: process.env.CHIP_BRAND_ID,
          reference,
          client: { email: process.env.CHIP_TEST_EMAIL || "sandbox@jutaone.biz" },
          purchase: {
            currency: "MYR",
            language: CHIP_LANGUAGE,
            products: [
              { name: "JutaOne.Biz — Store Pro (1 bulan)", price: amountMinor, quantity: 1 },
            ],
            // The webhook distinguishes rent from tokens by this marker.
            notes: `kind=rent;owner=${owner};usd=${RENT_USD_CENTS}`,
          },
          success_redirect: `${origin}/store?sub=success`,
          failure_redirect: `${origin}/store?sub=failed`,
          cancel_redirect: `${origin}/store?sub=cancelled`,
        }),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[jutaone] rent checkout failed", response.status, detail.slice(0, 200));
      return NextResponse.json({ code: "checkout_failed" }, { status: 502 });
    }

    const payload = (await response.json()) as { checkout_url?: string };
    if (!payload.checkout_url) {
      return NextResponse.json({ code: "checkout_failed" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, checkoutUrl: payload.checkout_url, reference });
  } catch (error) {
    console.error("[jutaone] rent checkout error", error);
    return NextResponse.json({ code: "checkout_failed" }, { status: 502 });
  }
}

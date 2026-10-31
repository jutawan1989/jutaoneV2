import { NextResponse, type NextRequest } from "next/server";
import {
  createStripeCheckoutSession,
  InvalidStripeEmailError,
} from "@/lib/payment/stripe";
import { getSubscription, RENT_USD_CENTS } from "@/lib/subscription";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opens a Stripe Checkout for one month of Store Rent ($5.00 USD).
 *
 * 100% USD (Boss final): no Chip, no MYR conversion. Rent is a Stripe card
 * payment exactly like a token top-up — 500 integer cents — with the owner
 * hash riding in metadata so the Stripe webhook can attribute it.
 *
 * Kept separate from `/api/topup`: a rent payment must not be confused with a
 * token purchase, since one extends a subscription and the other grants tokens.
 */

export async function POST(request: NextRequest) {
  const owner = identifyVisitor(request.headers).visitorKey;

  const existing = await getSubscription(owner);
  if (existing && existing.status === "active" && existing.isOpen) {
    return NextResponse.json({ code: "already_active" }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const usd = RENT_USD_CENTS / 100;

  try {
    const session = await createStripeCheckoutSession(usd, owner, body?.email, {
      origin: request.nextUrl.origin,
    });
    return NextResponse.json({ ok: true, checkoutUrl: session.checkoutUrl, reference: session.reference });
  } catch (error) {
    if (error instanceof InvalidStripeEmailError) {
      return NextResponse.json({ code: "invalid_email" }, { status: 400 });
    }
    console.error("[jutaone] rent checkout failed", error);
    return NextResponse.json({ code: "checkout_failed" }, { status: 502 });
  }
}

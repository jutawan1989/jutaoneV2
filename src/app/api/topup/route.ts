import { NextResponse, type NextRequest } from "next/server";
import { logEvent, parseUtm } from "@/lib/analytics/events";
import { isVariant, resolveVariant } from "@/lib/analytics/variant";
import { detectLocale, detectRegion } from "@/lib/geo";
import { isLocale } from "@/lib/i18n/config";
import {
  createStripeCheckoutSession,
  InvalidStripeEmailError,
} from "@/lib/payment/stripe";
import { sessionOwnerFromHeaders } from "@/lib/auth/member";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TopUpBody = {
  locale?: unknown;
  variant?: unknown;
  amountUsd?: unknown;
  email?: unknown;
  name?: unknown;
  /** Gateway field kept for backward compatibility — always resolves to Stripe. */
  gateway?: unknown;
};

/**
 * Stripe-only top-up entry point (ToyyibPay CLOSED, Chip CLOSED).
 *
 * Every checkout opens a Stripe Checkout Session (Test Mode while
 * STRIPE_SECRET_KEY is a sk_test_ key): card payments for every region,
 * including Malaysia and Indonesia. The response names the gateway so the
 * UI can label it.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as TopUpBody | null;
  const headers = request.headers;
  const requested = typeof body?.locale === "string" ? body.locale : null;
  const locale = isLocale(requested) ? requested : detectLocale(headers);
  const region = detectRegion(headers);
  // Ledger identity: a signed-in member's `owner_ref` (the same key the
  // dashboard sums) wins; anonymous buyers fall back to the visitor hash.
  // Sending the visitor hash for a logged-in member credits a stranger's
  // key — the REAL bug behind the approved-but-uncredited ToyyibPay sandbox
  // payment (TP2610302248159272, owner=ef4c35cba).
  const visitor = identifyVisitor(headers);
  const ownerRef = sessionOwnerFromHeaders(headers) ?? visitor.visitorKey;

  const variant = isVariant(body?.variant)
    ? body.variant
    : resolveVariant(visitor.visitorKey, request.nextUrl.searchParams.get("variant"));
  const utm = parseUtm(request.nextUrl.search);

  try {
    // ToyyibPay CLOSED, Chip CLOSED: every checkout resolves to Stripe.
    // The `gateway` field is accepted but ignored — kept so old clients
    // that still send `gateway: "stripe"` keep working.
    const session = await createStripeCheckoutSession(body?.amountUsd, ownerRef, body?.email, {
      origin: request.nextUrl.origin,
      locale,
    });

    await logEvent({
      event: "topup_click",
      locale,
      region,
      variant,
      utm,
      visitorKey: visitor.visitorKey,
      props: {
        mode: session.mode,
        provider: "stripe",
        reference: session.reference,
        amount: session.usd,
      },
    });

    return NextResponse.json({
      mode: session.mode,
      provider: "stripe",
      checkoutUrl: session.checkoutUrl,
      reference: session.reference,
      amount: session.display,
      usd: session.usd,
      tokens: session.tokens,
      paymentLabel: "Credit / Debit Card (Stripe)",
    });
  } catch (error) {
    if (error instanceof InvalidStripeEmailError) {
      return NextResponse.json({ code: "invalid_email" }, { status: 400 });
    }
    console.error("[jutaone] top-up session failed", error);
    return NextResponse.json({ code: "topup_unavailable" }, { status: 502 });
  }
}

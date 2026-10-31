import { NextResponse, type NextRequest } from "next/server";
import { logEvent, parseUtm } from "@/lib/analytics/events";
import { isVariant, resolveVariant } from "@/lib/analytics/variant";
import { detectLocale, detectRegion } from "@/lib/geo";
import { isLocale } from "@/lib/i18n/config";
import {
  createStripeCheckoutSession,
  InvalidStripeEmailError,
} from "@/lib/payment/stripe";
import {
  createCurlecOrder,
  InvalidCurlecEmailError,
} from "@/lib/payment/curlec";
import { sessionOwnerFromHeaders } from "@/lib/auth/member";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TopUpBody = {
  locale?: unknown;
  variant?: unknown;
  amountUsd?: unknown;
  /** MYR amount for `gateway: "curlec"` (top-up size in ringgit). */
  amountMyr?: unknown;
  email?: unknown;
  name?: unknown;
  /** Gateway selector: `"curlec"` routes to Curlec, everything else Stripe. */
  gateway?: unknown;
  /** `true` when the payer declares a foreign card (locks +3% surcharge). */
  international?: unknown;
};

/**
 * Card top-up entry point: Stripe (global, USD) by default, Curlec
 * (Malaysia, MYR) when `gateway: "curlec"` is sent.
 *
 * Stripe Checkout opens a session (Test Mode while STRIPE_SECRET_KEY is a
 * sk_test_ key): card payments for every region. Curlec creates a Razorpay
 * order (Test Mode while CURLEC_KEY_ID is an rzp_test_ key, same host)
 * settled in MYR sen, and the UI completes it with Checkout.js. The
 * response names the gateway so the UI can label it.
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
    // Curlec (Malaysia, MYR): explicit gateway choice from the UI card toggle.
    if (typeof body?.gateway === "string" && body.gateway.toLowerCase() === "curlec") {
      const declaredInternational = body?.international === true;
      const order = await createCurlecOrder(body?.amountMyr, ownerRef, body?.email, {
        origin: request.nextUrl.origin,
        locale,
        international: declaredInternational,
      });

      await logEvent({
        event: "topup_click",
        locale,
        region,
        variant,
        utm,
        visitorKey: visitor.visitorKey,
        props: {
          mode: order.mode,
          provider: "curlec",
          reference: order.reference,
          amount: order.amountMYR,
          baseSen: order.baseSen,
          surchargeSen: order.surchargeSen,
          international: order.international,
        },
      });

      return NextResponse.json({
        mode: order.mode,
        provider: "curlec",
        checkoutUrl: order.checkoutUrl,
        // Checkout.js inputs: the UI posts these to Razorpay, no redirect.
        orderId: order.orderId,
        keyId: order.keyId,
        reference: order.reference,
        amountMyr: order.amountMYR,
        amountSen: order.totalSen,
        baseSen: order.baseSen,
        surchargeSen: order.surchargeSen,
        international: order.international,
        amount: order.display,
        tokens: order.tokens,
        currency: "MYR",
        paymentLabel: "Credit / Debit Card (Curlec)",
      });
    }

    // Default: Stripe (ToyyibPay CLOSED, Chip CLOSED — every other value,
    // including legacy `gateway: "stripe"`, resolves to Stripe).
    // The `gateway` field is accepted but only "curlec" diverts — kept so
    // old clients that still send `gateway: "stripe"` keep working.
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
    if (error instanceof InvalidStripeEmailError || error instanceof InvalidCurlecEmailError) {
      return NextResponse.json({ code: "invalid_email" }, { status: 400 });
    }
    console.error("[jutaone] top-up session failed", error);
    return NextResponse.json({ code: "topup_unavailable" }, { status: 502 });
  }
}

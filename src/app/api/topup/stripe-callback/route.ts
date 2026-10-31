import { NextResponse, type NextRequest } from "next/server";
import { logEvent } from "@/lib/analytics/events";
import { resolveVariant } from "@/lib/analytics/variant";
import { detectLocale, detectRegion } from "@/lib/geo";
import { getSupabase } from "@/lib/db";
import { parseStripeEvent, recordStripeTopUp, verifyStripeSignature, type StripeCreditDb } from "@/lib/payment/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook callback.
 *
 * Stripe POSTs event JSON with a `Stripe-Signature` header
 * (HMAC-SHA256 over `${t}.${rawBody}`). The signature is verified first;
 * then only `checkout.session.completed` with `payment_status = "paid"`
 * credits tokens. Everything else is ignored (200, no credit) so a refund,
 * expiry, or test ping can never mint tokens.
 *
 * Idempotency rides on the `topups.provider_id` unique key
 * (`stripe:{session_id}`) plus the spend_ref unique index, so a retried
 * event credits once.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const check = verifyStripeSignature(rawBody, signature);

  if (!check.ok) {
    console.warn("[jutaone] rejecting Stripe callback", check.reason);
    return NextResponse.json({ ok: false, code: check.reason ?? "verification_failed" }, { status: 401 });
  }

  const event = parseStripeEvent(rawBody);
  if (!event) {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ ok: true, ignored: true, type: event.type });
  }

  const session = event.session;
  if (!session.sessionId) {
    return NextResponse.json({ ok: false, code: "missing_session" }, { status: 400 });
  }
  // Stripe may fire `completed` for $0 / trial sessions: only a session whose
  // payment actually landed credits tokens.
  if (session.paymentStatus && session.paymentStatus !== "paid") {
    return NextResponse.json({ ok: true, ignored: true, payment_status: session.paymentStatus });
  }

  const db = getSupabase();
  let outcome: Record<string, unknown> = {};
  if (db) {
    outcome = await recordStripeTopUp(db as unknown as StripeCreditDb, session);
  }

  await logEvent({
    event: "topup_success",
    locale: detectLocale(request.headers),
    region: detectRegion(request.headers),
    variant: resolveVariant(session.reference ?? "stripe"),
    props: { provider: "stripe", reference: session.reference ?? null, ...outcome },
  });

  return NextResponse.json({ ok: true, ...outcome });
}

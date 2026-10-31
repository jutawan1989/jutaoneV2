import { NextResponse, type NextRequest } from "next/server";
import { logEvent } from "@/lib/analytics/events";
import { resolveVariant } from "@/lib/analytics/variant";
import { detectLocale, detectRegion } from "@/lib/geo";
import { getSupabase } from "@/lib/db";
import {
  parseCurlecEvent,
  recordCurlecTopUp,
  verifyCurlecWebhook,
  type CurlecCreditDb,
} from "@/lib/payment/curlec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Curlec/Razorpay webhook callback.
 *
 * Curlec POSTs event JSON with an `X-Razorpay-Signature` header
 * (HMAC-SHA256 hex over the raw body). The signature is verified first;
 * then only `order.paid` / `payment.captured` with a `captured` payment
 * credits tokens. Everything else is ignored (200, no credit) so a refund,
 * a failed attempt, or a test ping can never mint tokens.
 *
 * Idempotency rides on the `topups.provider_id` unique key
 * (`curlec:{payment_id}`) plus the spend_ref unique index, so a retried
 * event credits once.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  const check = verifyCurlecWebhook(rawBody, signature);

  if (!check.ok) {
    console.warn("[jutaone] rejecting Curlec callback", check.reason);
    return NextResponse.json({ ok: false, code: check.reason ?? "verification_failed" }, { status: 401 });
  }

  const event = parseCurlecEvent(rawBody);
  if (!event) {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }
  if (event.type !== "order.paid" && event.type !== "payment.captured") {
    return NextResponse.json({ ok: true, ignored: true, type: event.type });
  }

  const payment = event.payment;
  if (!payment.paymentId) {
    return NextResponse.json({ ok: false, code: "missing_payment" }, { status: 400 });
  }
  // Razorpay may fire `order.paid` for an authorised-but-not-captured
  // payment: only captured money credits tokens.
  if (payment.status && payment.status !== "captured") {
    return NextResponse.json({ ok: true, ignored: true, payment_status: payment.status });
  }

  const db = getSupabase();
  if (!db) {
    return NextResponse.json({ ok: false, code: "store_unavailable" }, { status: 503 });
  }
  const outcome = await recordCurlecTopUp(db as unknown as CurlecCreditDb, payment);

  await logEvent({
    event: "topup_success",
    locale: detectLocale(request.headers),
    region: detectRegion(request.headers),
    variant: resolveVariant(payment.receipt ?? payment.orderId ?? "curlec"),
    props: { provider: "curlec", reference: payment.receipt ?? payment.orderId, ...outcome },
  });

  return NextResponse.json({ ok: true, ...outcome });
}

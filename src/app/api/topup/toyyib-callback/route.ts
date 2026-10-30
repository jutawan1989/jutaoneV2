import { NextResponse, type NextRequest } from "next/server";
import { logEvent } from "@/lib/analytics/events";
import { resolveVariant } from "@/lib/analytics/variant";
import { detectLocale, detectRegion } from "@/lib/geo";
import { getSupabase } from "@/lib/db";
import {
  parseToyyibReference,
  verifyToyyibCallback,
  type ToyyibCallback,
} from "@/lib/payment/toyyibpay";
import { recordToyyibTopUp, type ToyyibCreditDb } from "@/lib/payment/toyyib-credit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ToyyibPay server callback (`billCallbackUrl`).
 *
 * ToyyibPay POSTs form fields: refno, status (1 = success), order_id,
 * hash, reason, billcode, amount. The MD5 hash is verified first
 * (`MD5(secret + status + order_id + refno + "ok")`), then `verifyToyyibCallback`
 * re-checks the bill server-to-server via getBillTransactions before any
 * token is credited.
 *
 * Idempotency rides on the `topups.provider_id` unique key (`toyyib:{billcode}`)
 * plus the spend_ref unique index, so a retried callback credits once.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const get = (key: string): string | null => {
    const value = form?.get(key);
    return typeof value === "string" && value !== "" ? value : null;
  };

  const callback: ToyyibCallback = {
    refno: get("refno"),
    orderId: get("order_id"),
    hash: get("hash"),
    status: get("status"),
    billcode: get("billcode"),
    amount: get("amount"),
    reason: get("reason"),
  };

  if (!callback.refno) return NextResponse.json({ ok: false, code: "missing_refno" }, { status: 400 });
  if (callback.status !== "1") {
    return NextResponse.json({ ok: true, ignored: true, status: callback.status ?? null });
  }

  const check = await verifyToyyibCallback(callback);
  if (!check.ok) {
    console.warn("[jutaone] rejecting ToyyibPay callback", check.reason);
    return NextResponse.json({ ok: false, code: check.reason ?? "verification_failed" }, { status: 401 });
  }

  // Our bill sends `billExternalReferenceNo`, so the vendor echoes that same
  // value back as `order_id`. Parse THAT — `refno` is ToyyibPay's own payment
  // reference, not our token-credit instruction.
  const ref = parseToyyibReference(callback.orderId);
  const db = getSupabase();
  let outcome: Record<string, unknown> = {};

  if (db && callback.billcode) {
    // The Supabase client's builders resolve to `{ error }`, matching the
    // narrow `ToyyibCreditDb` surface; cast at the boundary, not inside it.
    outcome = await recordToyyibTopUp(db as unknown as ToyyibCreditDb, callback, ref);
  }

  await logEvent({
    event: "topup_success",
    locale: detectLocale(request.headers),
    region: detectRegion(request.headers),
    variant: resolveVariant(callback.orderId ?? callback.refno ?? "toyyib"),
    props: { provider: "toyyibpay", reference: callback.orderId ?? callback.refno, ...outcome },
  });

  return NextResponse.json({ ok: true, ...outcome });
}

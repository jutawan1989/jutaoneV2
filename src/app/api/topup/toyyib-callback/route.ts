import { NextResponse, type NextRequest } from "next/server";
import { logEvent } from "@/lib/analytics/events";
import { resolveVariant } from "@/lib/analytics/variant";
import { detectLocale, detectRegion } from "@/lib/geo";
import { getSupabase } from "@/lib/db";
import {
  parseToyyibReference,
  resolveToyyibAmountSen,
  verifyToyyibCallback,
  type ToyyibCallback,
} from "@/lib/payment/toyyibpay";
import { TOKENS_PER_USD } from "@/lib/pricing";

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
    outcome = await recordToyyibTopUp(db, callback, ref);
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

type Db = NonNullable<ReturnType<typeof getSupabase>>;
type ParsedRef = ReturnType<typeof parseToyyibReference>;

async function recordToyyibTopUp(
  db: Db,
  callback: ToyyibCallback,
  ref: ParsedRef,
): Promise<Record<string, unknown>> {
  const providerId = `toyyib:${callback.billcode}`;
  const amountSen = resolveToyyibAmountSen(callback.amount, ref);
  const { error } = await db.from("topups").upsert(
    {
      provider: "toyyibpay",
      provider_id: providerId,
      reference: callback.orderId ?? callback.refno,
      status: "paid",
      amount: amountSen,
      currency: "MYR",
      base_amount: ref.baseSen !== null ? ref.baseSen / 100 : null,
      base_currency: "MYR",
      fx_rate: null,
    },
    { onConflict: "provider_id" },
  );
  if (error || !callback.billcode) {
    console.error("[jutaone] toyyib topup record failed", error?.message ?? "missing billcode", {
      providerId,
      amount: callback.amount,
    });
    return { recorded: false };
  }
  if (!ref.ownerRef) return { recorded: true, credited: false, reason: "missing_owner" };

  // Tokens credit on the BASE only: the RM1.00 fee is ToyyibPay's cut, not
  // tokens. usdCents in the ref is exact, so no FX re-derivation is needed.
  const usdCents = ref.usdCents ?? 100;
  const tokens = Math.round((usdCents / 100) * TOKENS_PER_USD);
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return { recorded: true, credited: false, reason: "invalid_amount" };
  }

  const { error: ledgerError } = await db.from("token_ledger").insert({
    visitor_key: ref.ownerRef,
    delta: tokens,
    reason: "topup",
    spend_ref: providerId,
    tokens,
  });
  if (ledgerError) {
    if (ledgerError.code === "23505" || /duplicate key/i.test(ledgerError.message)) {
      return { recorded: true, credited: true, tokens, replayed: true };
    }
    console.error("[jutaone] toyyib ledger credit failed", ledgerError.message, {
      providerId,
      ownerRef: ref.ownerRef,
      tokens,
    });
    return { recorded: true, credited: false, reason: "credit_failed" };
  }
  return { recorded: true, credited: true, tokens, replayed: false, feeSen: ref.feeSen ?? 100 };
}

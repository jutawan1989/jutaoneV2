import { NextResponse, type NextRequest } from "next/server";
import { logEvent } from "@/lib/analytics/events";
import { resolveVariant } from "@/lib/analytics/variant";
import { detectLocale, detectRegion } from "@/lib/geo";
import { getSupabase } from "@/lib/db";
import { verifyCallbackSignature } from "@/lib/payment/chip";
import { TOKENS_PER_USD } from "@/lib/pricing";
import { RENT_DAYS } from "@/lib/subscription";
import { classifyPurchase, type ClassifiedPurchase } from "@/lib/payment/purchase-kind";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChipCallback = { id?: string; reference?: string; status?: string; purchase?: { total?: number; currency?: string; notes?: string } };

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature");
  const check = verifyCallbackSignature(rawBody, signature);

  if (!check.ok) { console.warn("[jutaone] rejecting Chip callback", check.reason); return NextResponse.json({ ok: false, code: "invalid_signature" }, { status: 401 }); }

  const payload = safeParse(rawBody);
  if (!payload) return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  if (payload.status !== "paid") return NextResponse.json({ ok: true, ignored: true, status: payload.status ?? null });

  const purchase = classifyPurchase(payload.purchase?.notes);
  const db = getSupabase();
  let outcome: Record<string, unknown> = { kind: purchase.kind };

  if (db && payload.id) {
    if (purchase.kind === "rent") outcome = { ...outcome, ...(await activateRent(db, payload, purchase)) };
    else outcome = { ...outcome, ...(await recordTopUp(db, payload, purchase)) };
  }

  await logEvent({
    event: purchase.kind === "rent" ? "rent_success" : "topup_success",
    locale: detectLocale(request.headers), region: detectRegion(request.headers),
    variant: resolveVariant(payload.reference ?? "callback"), props: { provider: "chip", reference: payload.reference ?? null, ...outcome },
  });

  return NextResponse.json({ ok: true, ...outcome });
}

type Db = NonNullable<ReturnType<typeof getSupabase>>;

async function activateRent(db: Db, payload: ChipCallback, purchase: ClassifiedPurchase): Promise<Record<string, unknown>> {
  const ownerRef = purchase.ownerRef;
  if (!ownerRef) return { activated: false, reason: "missing_owner" };
  const now = new Date();
  const { data: sub, error } = await db.from("store_subscriptions").upsert({ owner_ref: ownerRef, plan: "store_pro", status: "active", updated_at: now.toISOString() }, { onConflict: "owner_ref" }).select("id").maybeSingle();
  const subscriptionId = sub?.id ?? (await db.from("store_subscriptions").select("id").eq("owner_ref", ownerRef).maybeSingle()).data?.id;
  if (error || !subscriptionId) return { activated: false, reason: "activation_failed" };

  const { data: appliedRows, error: applyError } = await db.rpc("jutaone_apply_rent_payment", { p_subscription: subscriptionId, p_provider_id: payload.id!, p_reference: payload.reference ?? null, p_amount_minor: payload.purchase?.total ?? 0, p_currency: payload.purchase?.currency ?? "MYR", p_days: RENT_DAYS });
  if (applyError) return { activated: false, reason: "apply_failed" };

  const row = Array.isArray(appliedRows) ? appliedRows[0] : appliedRows;
  const applied = Boolean(row?.applied);
  const grossMinor = payload.purchase?.total ?? null;
  const currency = payload.purchase?.currency ?? null;
  let levelsPaid: number | null = null;

  if (applied && grossMinor && currency) {
    const { data: buyerCode } = await db.from("referral_codes").select("id").eq("owner_ref", ownerRef).maybeSingle();
    if (buyerCode?.id) {
      const { data: written, error: distError } = await db.rpc("jutaone_distribute_commission", { p_source: "rent", p_topup_id: null, p_rent_id: subscriptionId, p_from_code_id: buyerCode.id, p_gross_minor: grossMinor, p_currency: currency });
      if (!distError) levelsPaid = typeof written === "number" ? written : 0;
    } else levelsPaid = 0;
  }
  return { activated: true, applied, paidUntil: row?.period_end ?? null, levelsPaid, replayed: !applied };
}

async function recordTopUp(db: Db, payload: ChipCallback, purchase: ClassifiedPurchase): Promise<Record<string, unknown>> {
  const { error } = await db.from("topups").upsert({ provider: "chip", provider_id: payload.id, reference: payload.reference ?? null, status: payload.status, amount: payload.purchase?.total ?? null, currency: payload.purchase?.currency ?? null, base_amount: purchase.rmCents, base_currency: purchase.rmCents !== null ? "MYR" : null, fx_rate: purchase.fxRate }, { onConflict: "provider_id" });
  if (error || !payload.id) return { recorded: false };
  if (!purchase.ownerRef) return { recorded: true, credited: false, reason: "missing_owner" };

  const usdCents = purchase.usdCents ?? 100;
  const tokens = Math.round((usdCents / 100) * TOKENS_PER_USD);
  if (!Number.isFinite(tokens) || tokens <= 0) return { recorded: true, credited: false, reason: "invalid_amount" };

  const { error: ledgerError } = await db.from("token_ledger").insert({ visitor_key: purchase.ownerRef, delta: tokens, reason: "topup", spend_ref: `chip:${payload.id}`, tokens });
  if (ledgerError) {
    if (ledgerError.code === "23505" || /duplicate key/i.test(ledgerError.message)) return { recorded: true, credited: true, tokens, replayed: true };
    return { recorded: true, credited: false, reason: "credit_failed" };
  }
  return { recorded: true, credited: true, tokens, replayed: false };
}

function safeParse(raw: string): ChipCallback | null {
  try { const parsed = JSON.parse(raw) as unknown; return parsed && typeof parsed === "object" ? (parsed as ChipCallback) : null; } catch { return null; }
}

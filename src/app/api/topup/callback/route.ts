import { NextResponse, type NextRequest } from "next/server";
import { logEvent } from "@/lib/analytics/events";
import { resolveVariant } from "@/lib/analytics/variant";
import { detectLocale, detectRegion } from "@/lib/geo";
import { getSupabase } from "@/lib/db";
import { verifyCallbackSignature } from "@/lib/payment/chip";
import { RENT_DAYS } from "@/lib/subscription";
import { classifyPurchase, type ClassifiedPurchase } from "@/lib/payment/purchase-kind";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChipCallback = {
  id?: string;
  reference?: string;
  status?: string;
  purchase?: { total?: number; currency?: string; notes?: string };
};

/**
 * Chip.Asia webhook.
 *
 * Signature is verified against `CHIP_PUBLIC_KEY`; callbacks are rejected in
 * production when no key is configured, so a missing secret can never become an
 * open webhook.
 *
 * A paid callback is routed by `classifyPurchase`:
 *   - rent   -> activates the subscription and credits the referring affiliate
 *   - tokens -> records the top-up as before
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature");

  const check = verifyCallbackSignature(rawBody, signature);
  if (!check.ok) {
    console.warn("[jutaone] rejecting Chip callback", check.reason);
    return NextResponse.json({ ok: false, code: "invalid_signature" }, { status: 401 });
  }

  const payload = safeParse(rawBody);
  if (!payload) {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }

  if (payload.status !== "paid") {
    return NextResponse.json({ ok: true, ignored: true, status: payload.status ?? null });
  }

  const purchase = classifyPurchase(payload.purchase?.notes);
  const db = getSupabase();

  let outcome: Record<string, unknown> = { kind: purchase.kind };

  if (db && payload.id) {
    if (purchase.kind === "rent") {
      outcome = { ...outcome, ...(await activateRent(db, payload, purchase)) };
    } else {
      outcome = { ...outcome, ...(await recordTopUp(db, payload)) };
    }
  }

  const headers = request.headers;
  await logEvent({
    event: purchase.kind === "rent" ? "rent_success" : "topup_success",
    locale: detectLocale(headers),
    region: detectRegion(headers),
    variant: resolveVariant(payload.reference ?? "callback"),
    props: { provider: "chip", reference: payload.reference ?? null, ...outcome },
  });

  return NextResponse.json({ ok: true, ...outcome });
}

type Db = NonNullable<ReturnType<typeof getSupabase>>;

/** Store Rent: extend the subscription and pay the referring affiliate. */
async function activateRent(
  db: Db,
  payload: ChipCallback,
  purchase: ClassifiedPurchase,
): Promise<Record<string, unknown>> {
  // The owner travels in the notes because Chip's callback has no browser
  // session. It is a pseudonymous hash, not an identifier we collected.
  const ownerRef = purchase.ownerRef;
  if (!ownerRef) {
    console.error("[jutaone] rent callback without an owner_ref", {
      reference: payload.reference,
    });
    return { activated: false, reason: "missing_owner" };
  }

  const now = new Date();

  // The subscription must exist before a payment can be applied to it. A
  // merchant who subscribes without trialling has no row yet, so create one.
  const { data: sub, error } = await db
    .from("store_subscriptions")
    .upsert(
      {
        owner_ref: ownerRef,
        plan: "store_pro",
        status: "active",
        updated_at: now.toISOString(),
      },
      { onConflict: "owner_ref" },
    )
    .select("id")
    .maybeSingle();

  const subscriptionId =
    sub?.id ??
    (
      await db
        .from("store_subscriptions")
        .select("id")
        .eq("owner_ref", ownerRef)
        .maybeSingle()
    ).data?.id;

  if (error || !subscriptionId) {
    console.error("[jutaone] rent activation failed", error?.message ?? "no subscription id");
    return { activated: false, reason: "activation_failed" };
  }

  // Applied exactly once per gateway purchase id: a Chip retry must not hand
  // out a free month. See supabase/rent_payments.sql.
  const { data: appliedRows, error: applyError } = await db.rpc(
    "jutaone_apply_rent_payment",
    {
      p_subscription: subscriptionId,
      p_provider_id: payload.id!,
      p_reference: payload.reference ?? null,
      p_amount_minor: payload.purchase?.total ?? 0,
      p_currency: payload.purchase?.currency ?? "MYR",
      p_days: RENT_DAYS,
    },
  );

  if (applyError) {
    console.error("[jutaone] rent payment apply failed", applyError.message);
    return { activated: false, reason: "apply_failed" };
  }

  const row = Array.isArray(appliedRows) ? appliedRows[0] : appliedRows;
  const applied = Boolean(row?.applied);
  const periodEnd = row?.period_end ?? null;

  // Pay the upline matrix only when a new period was actually bought: a Chip
  // retry must not pay 19 people twice.
  let levelsPaid: number | null = null;
  const grossMinor = payload.purchase?.total ?? null;
  const currency = payload.purchase?.currency ?? null;

  if (applied && grossMinor && currency) {
    // `p_from_code_id` is the BUYER's own code; level 1 is its parent. A merchant
    // who bought without a referral has no code, so nothing is paid.
    const { data: buyerCode, error: codeError } = await db
      .from("referral_codes")
      .select("id")
      .eq("owner_ref", ownerRef)
      .maybeSingle();

    if (codeError) {
      console.error("[jutaone] affiliate lookup failed", codeError.message);
    } else if (buyerCode?.id) {
      const { data: written, error: matrixError } = await db.rpc(
        "jutaone_distribute_commission",
        {
          p_source: "rent",
          p_topup_id: null,
          p_rent_id: subscriptionId,
          p_from_code_id: buyerCode.id,
          p_gross_minor: grossMinor,
          p_currency: currency,
        },
      );
      if (matrixError) {
        // Not fatal: the customer has paid and the store is open. The matrix can
        // be replayed from the payment row afterwards.
        console.error("[jutaone] matrix distribution failed", matrixError.message);
      } else {
        levelsPaid = typeof written === "number" ? written : 0;
      }
    } else {
      levelsPaid = 0; // no referrer, so no upline to pay
    }
  }

  console.log("[jutaone] rent payment", {
    ownerRef: ownerRef.slice(0, 12),
    applied,
    periodEnd,
    levelsPaid,
  });

  return {
    activated: true,
    applied,
    paidUntil: periodEnd,
    levelsPaid,
    replayed: !applied,
  };
}

/** Token top-up: unchanged behaviour from before Store Rent existed. */
async function recordTopUp(db: Db, payload: ChipCallback): Promise<Record<string, unknown>> {
  const { error } = await db.from("topups").upsert(
    {
      provider: "chip",
      provider_id: payload.id,
      reference: payload.reference ?? null,
      status: payload.status,
      amount: payload.purchase?.total ?? null,
      currency: payload.purchase?.currency ?? null,
    },
    { onConflict: "provider_id" },
  );
  if (error) {
    console.error("[jutaone] topups upsert failed", error.message);
    return { recorded: false };
  }
  return { recorded: true };
}

function safeParse(raw: string): ChipCallback | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as ChipCallback) : null;
  } catch {
    return null;
  }
}

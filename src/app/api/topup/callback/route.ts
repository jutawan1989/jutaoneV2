import { NextResponse, type NextRequest } from "next/server";
import { logEvent } from "@/lib/analytics/events";
import { resolveVariant } from "@/lib/analytics/variant";
import { detectLocale, detectRegion } from "@/lib/geo";
import { getSupabase } from "@/lib/db";
import { grantTokensForTopUp } from "@/lib/ledger";
import { verifyCallbackSignature } from "@/lib/payment/chip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChipCallback = {
  id?: string;
  reference?: string;
  status?: string;
  purchase?: { total?: number; currency?: string; notes?: string };
};

/**
 * Chip.Asia webhook. Signature is verified against `CHIP_PUBLIC_KEY`; callbacks
 * are rejected in production when no key is configured.
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

  const paid = payload.status === "paid";
  if (!paid) {
    return NextResponse.json({ ok: true, ignored: true, status: payload.status ?? null });
  }

  const db = getSupabase();
  let credited: { tokens: number; alreadyGranted: boolean } | null = null;

  if (db && payload.id) {
    // The USD base and the FX rate that produced the local charge are carried in
    // the purchase notes, so historical revenue is readable in the base currency
    // without replaying a rate that has since moved.
    const notes = parsePurchaseNotes(payload.purchase?.notes);
    // Chip's webhook carries no browser session, so the buyer is recovered from
    // the visitor recorded against our own reference at checkout time.
    const visitorKey = await resolveVisitorKey(db, payload.reference ?? null);

    const { data: topupRow, error } = await db
      .from("topups")
      .upsert(
        {
          provider: "chip",
          provider_id: payload.id,
          reference: payload.reference ?? null,
          status: payload.status,
          amount: payload.purchase?.total ?? null,
          currency: payload.purchase?.currency ?? null,
          base_usd_cents: notes.baseUsdCents,
          fx_rate: notes.fxRate,
          fx_currency: payload.purchase?.currency ?? null,
          visitor_key: visitorKey,
        },
        { onConflict: "provider_id" },
      )
      .select("id, base_usd_cents, visitor_key")
      .single();

    if (error) {
      console.error("[jutaone] topups upsert failed", error.message);
    } else if (topupRow) {
      // Credit only after the paid row exists: the ledger guard checks the
      // top-up status, so ordering is deliberate.
      if (!topupRow.visitor_key) {
        console.error("[jutaone] cannot credit tokens: no visitor_key for reference", {
          reference: payload.reference,
        });
      } else {
        const grant = await grantTokensForTopUp({
          id: Number(topupRow.id),
          visitorKey: topupRow.visitor_key,
          baseUsdCents:
            topupRow.base_usd_cents === null ? null : Number(topupRow.base_usd_cents),
          tokens: null,
        });
        if (grant.ok) {
          credited = { tokens: grant.tokens, alreadyGranted: grant.alreadyGranted };
          console.log("[jutaone] tokens credited", {
            reference: payload.reference,
            tokens: grant.tokens,
            replay: grant.alreadyGranted,
          });
        } else {
          console.error("[jutaone] token credit failed", grant.reason);
        }
      }
    }
  }

  const headers = request.headers;
  await logEvent({
    event: "topup_success",
    locale: detectLocale(headers),
    region: detectRegion(headers),
    variant: resolveVariant(payload.reference ?? "callback"),
    props: {
      provider: "chip",
      reference: payload.reference ?? null,
      tokens: credited?.tokens ?? null,
      token_replay: credited?.alreadyGranted ?? null,
    },
  });

  return NextResponse.json({ ok: true, credited });
}

/**
 * Recovers the pseudonymous buyer for a purchase.
 *
 * The `topup_click` event written when checkout was created carries the
 * visitor hash, and the reference ties the two together. No PII is involved and
 * nothing new is collected at payment time.
 */
async function resolveVisitorKey(
  db: NonNullable<ReturnType<typeof getSupabase>>,
  reference: string | null,
): Promise<string | null> {
  if (!reference) return null;

  const { data, error } = await db
    .from("events")
    .select("visitor_key")
    .eq("name", "topup_click")
    .eq("props->>reference", reference)
    .not("visitor_key", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[jutaone] visitor lookup failed", error.message);
    return null;
  }
  return (data?.visitor_key as string | undefined) ?? null;
}

function parsePurchaseNotes(notes: string | undefined): {
  baseUsdCents: number | null;
  fxRate: number | null;
} {
  const base = notes?.match(/base=(\d+)usc/);
  const fx = notes?.match(/fx=([\d.]+)/);
  const baseUsdCents = base ? Number(base[1]) : NaN;
  const fxRate = fx ? Number(fx[1]) : NaN;
  return {
    baseUsdCents: Number.isFinite(baseUsdCents) ? baseUsdCents : null,
    fxRate: Number.isFinite(fxRate) ? fxRate : null,
  };
}

function safeParse(raw: string): ChipCallback | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as ChipCallback) : null;
  } catch {
    return null;
  }
}

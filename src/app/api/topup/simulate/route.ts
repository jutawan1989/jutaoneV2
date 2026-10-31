import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { logEvent, parseUtm } from "@/lib/analytics/events";
import { isVariant, resolveVariant } from "@/lib/analytics/variant";
import { sessionOwnerFromHeaders } from "@/lib/auth/member";
import { getSupabase } from "@/lib/db";
import { detectLocale, detectRegion } from "@/lib/geo";
import { isLocale } from "@/lib/i18n/config";
import { curlecConfigured } from "@/lib/payment/curlec";
import { TOKENS_PER_USD } from "@/lib/pricing";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sandbox helper: records a REAL `paid` topup row and credits the token
 * ledger, so the demo funnel is truthful end to end — the success screen
 * verifies against this row via `/api/topup/status` and the dashboard
 * balance actually increases. Disabled as soon as Curlec is configured or
 * when running in production.
 *
 * Identity matches the dashboard: a signed-in member's `owner_ref` wins,
 * anonymous visitors fall back to the header-derived visitor hash.
 */
export async function POST(request: NextRequest) {
  if (curlecConfigured() || process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, code: "simulation_disabled" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { locale?: unknown; variant?: unknown; reference?: unknown; amountUsd?: unknown }
    | null;
  const headers = request.headers;
  const requested = typeof body?.locale === "string" ? body.locale : null;
  const locale = isLocale(requested) ? requested : detectLocale(headers);
  const region = detectRegion(headers);
  const visitor = identifyVisitor(headers);
  const variant = isVariant(body?.variant) ? body.variant : resolveVariant(visitor.visitorKey);

  const ownerRef = sessionOwnerFromHeaders(headers) ?? visitor.visitorKey;
  const reference =
    typeof body?.reference === "string" && body.reference.trim() !== ""
      ? body.reference.trim()
      : `sandbox-${randomUUID().slice(0, 8)}`;
  const usd = typeof body?.amountUsd === "number" && Number.isFinite(body.amountUsd) ? body.amountUsd : 1;
  const tokens = Math.round(usd * TOKENS_PER_USD);
  const providerId = `sandbox:${reference}`;

  const db = getSupabase();
  if (!db) {
    return NextResponse.json({ ok: false, code: "store_unavailable" }, { status: 503 });
  }
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return NextResponse.json({ ok: false, code: "invalid_amount" }, { status: 400 });
  }

  const { error: topupError } = await db.from("topups").upsert(
    {
      provider: "sandbox",
      provider_id: providerId,
      reference,
      status: "paid",
      amount: Math.round(usd * 100),
      currency: "USD",
      base_amount: null,
      base_currency: null,
      fx_rate: null,
    },
    { onConflict: "provider_id" },
  );
  if (topupError) {
    console.error("[jutaone] sandbox topup record failed", topupError);
    return NextResponse.json({ ok: false, code: "record_failed" }, { status: 502 });
  }

  const { error: ledgerError } = await db.from("token_ledger").insert({
    visitor_key: ownerRef,
    delta: tokens,
    reason: "topup",
    spend_ref: providerId,
    tokens,
  });
  let replayed = false;
  if (ledgerError) {
    if (ledgerError.code === "23505" || /duplicate key/i.test(ledgerError.message)) {
      replayed = true;
    } else {
      console.error("[jutaone] sandbox ledger credit failed", ledgerError);
      return NextResponse.json({ ok: false, code: "credit_failed" }, { status: 502 });
    }
  }

  await logEvent({
    event: "topup_success",
    locale,
    region,
    variant,
    utm: parseUtm(request.nextUrl.search),
    visitorKey: visitor.visitorKey,
    props: { provider: "sandbox", reference },
  });

  return NextResponse.json({ ok: true, reference, tokens, replayed });
}

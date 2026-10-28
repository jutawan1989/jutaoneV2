import { NextResponse, type NextRequest } from "next/server";
import { logEvent } from "@/lib/analytics/events";
import { resolveVariant } from "@/lib/analytics/variant";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/member";
import { detectLocale, detectRegion } from "@/lib/geo";
import { isLocale, type Locale } from "@/lib/i18n/config";
import {
  getPremiumMetalAnalysis,
  metalCurrencyForRegion,
  type MetalCurrency,
} from "@/lib/metals";
import { METALS_COST_TOKENS, chargeTokens, getTokenBalance } from "@/lib/tokens";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PREMIUM metals analysis (Metal Sentinel via RapidAPI), metered.
 *
 * Boss spec Task 2: dashboard "Analisis Pasaran AI Mendalam". Every call for
 * a signed-in user costs 2,000 tokens. Anonymous visitors have no ledger
 * identity, so they get 401 and must log in first. Balance is checked BEFORE
 * the vendor call, so a broke user gets 402 without spending our RapidAPI
 * quota. A failed vendor fetch is 503 and free — never charge for no data.
 *
 * Currency: MYR for Malaysia, IDR for Indonesia (from the Cloudflare region
 * header, overridable with `?currency=`). No USD, no guessing.
 */
export async function GET(request: NextRequest) {
  const headers = request.headers;

  const header = headers.get("cookie") ?? "";
  const ownerRef = verifySession(readCookie(header, SESSION_COOKIE) ?? undefined);
  if (!ownerRef) {
    return NextResponse.json({ code: "login_required" }, { status: 401 });
  }

  const requested = request.nextUrl.searchParams.get("currency")?.toUpperCase() ?? null;
  const region = detectRegion(headers);
  const currency: MetalCurrency =
    requested === "MYR" || requested === "IDR" ? requested : metalCurrencyForRegion(region);

  const localeParam = request.nextUrl.searchParams.get("locale");
  const locale: Locale = isLocale(localeParam) ? localeParam : detectLocale(headers);
  const visitor = identifyVisitor(headers);
  const variant = resolveVariant(ownerRef, request.nextUrl.searchParams.get("variant"));

  const reference =
    request.nextUrl.searchParams.get("rid")?.slice(0, 64) ??
    `metals:${ownerRef.slice(0, 16)}:${currency}:${Math.floor(Date.now() / 60_000)}`;

  const balance = await getTokenBalance(ownerRef);
  if (balance < METALS_COST_TOKENS) {
    return NextResponse.json(
      {
        code: "insufficient_tokens",
        message: "Baki tidak cukup — sila Top-Up",
        required: METALS_COST_TOKENS,
        balance,
        currency,
      },
      { status: 402 },
    );
  }

  let prices;
  try {
    prices = await getPremiumMetalAnalysis(currency);
  } catch (error) {
    console.error("[jutaone] metals fetch failed", (error as Error).message.slice(0, 160));
    return NextResponse.json({ code: "metals_unavailable", currency }, { status: 503 });
  }

  const charge = await chargeTokens({
    visitorKey: ownerRef,
    cost: METALS_COST_TOKENS,
    reference,
    note: `metals:${currency}`,
  });

  if (!charge.ok && charge.reason === "insufficient") {
    // Lost the race against a concurrent charge: data fetched, but no fee taken.
    return NextResponse.json(
      {
        code: "insufficient_tokens",
        message: "Baki tidak cukup — sila Top-Up",
        required: METALS_COST_TOKENS,
        balance,
        currency,
      },
      { status: 402 },
    );
  }
  if (!charge.ok) {
    console.error("[jutaone] metals charge failed", charge.reason);
    return NextResponse.json({ code: "charge_failed", currency }, { status: 500 });
  }

  await logEvent({
    event: "metals_success",
    locale,
    region,
    variant,
    visitorKey: ownerRef,
    props: { currency, visitor: visitor.visitorKey },
  });

  return NextResponse.json({
    ok: true,
    ...prices,
    billing: {
      chargedTokens: charge.charged ? METALS_COST_TOKENS : 0,
      balanceAfter: charge.balanceAfter,
      replayed: charge.replayed,
    },
    variant,
  });
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

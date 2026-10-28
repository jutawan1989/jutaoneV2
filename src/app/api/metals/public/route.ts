import { NextResponse, type NextRequest } from "next/server";
import { detectRegion } from "@/lib/geo";
import {
  getPublicMetalPrices,
  publicCurrencyForRegion,
  type PublicMetalCurrency,
} from "@/lib/goldprice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FREE public metals feed for the homepage widget (Goldprice.dev).
 *
 * No login, no tokens, no 402 — this is the free tier. The 4-hour cache lives
 * in `lib/goldprice.ts` (memory + Supabase), so the vendor quota survives
 * traffic spikes and Worker restarts. A vendor outage serves stale cache, and
 * only a total miss returns 503 with nulls so the widget can hide itself.
 */
export async function GET(request: NextRequest) {
  const headers = request.headers;
  const requested = request.nextUrl.searchParams.get("currency")?.toUpperCase() ?? null;
  const region = detectRegion(headers);
  const currency: PublicMetalCurrency =
    requested === "MYR" || requested === "IDR" ? requested : publicCurrencyForRegion(region);

  const prices = await getPublicMetalPrices(currency);
  if (!prices) {
    return NextResponse.json(
      { ok: false, code: "metals_unavailable", currency, gold: null, silver: null },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, label: "Harga Pasaran Semasa", ...prices });
}

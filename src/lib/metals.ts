/**
 * Metal Sentinel (via RapidAPI) — PREMIUM deep-market analysis for the dashboard.
 *
 * Boss spec Task 2: `getPremiumMetalAnalysis()` with RAPIDAPI_KEY, metered at
 * 2,000 tokens per call (enforced in `src/app/api/metals/route.ts`, not here).
 * Used when the user clicks "Analisis Pasaran AI Mendalam" in the dashboard.
 *
 * Endpoints on `metal-sentinel.p.rapidapi.com`:
 *   GET /api/v1/gold-price?currency=MYR     — spot + karat prices (24k/18k/14k/9k)
 *   GET /api/v1/silver-price?currency=MYR   — spot + fineness (999/958/925/900/800)
 *
 * Auth: `X-RapidAPI-Key: RAPIDAPI_KEY` + `X-RapidAPI-Host: metal-sentinel.p.rapidapi.com`.
 * Key lives in Cloudflare Secrets (RAPIDAPI_KEY), never in the client bundle.
 *
 * The deep part beyond the homepage feed: day range (high/low), intraday
 * change + change %, per-ounce karat/fineness breakdowns, and a trend signal
 * derived from change % (up / down / flat) with the raw numbers attached so
 * the UI can show its own copy. No investment advice is generated — numbers
 * only, the compliance disclaimer stays on the widget.
 *
 * Response shape (per the vendor docs): `{ results: [{ symbol, currency,
 * ask, mid, bid, high, low, timestamp, change, changePercentage, unit,
 * karat_prices | fineness_prices }] }`. Prices are per troy ounce in the
 * requested currency. Everything is optional-chained: a changed payload is a
 * failed fetch, never a crash.
 */

export type MetalCurrency = "MYR" | "IDR";

export type TrendSignal = "up" | "down" | "flat";

export type MetalQuote = {
  symbol: string;
  currency: MetalCurrency;
  /** Mid spot price per troy ounce, in the requested currency. */
  mid: number | null;
  bid: number | null;
  ask: number | null;
  high: number | null;
  low: number | null;
  change: number | null;
  changePercentage: number | null;
  /** Unix seconds. */
  timestamp: number | null;
  /** Karat breakdown for gold (per ounce): 24k / 18k / 14k / 9k. */
  karatPrices: Record<string, number> | null;
  /** Fineness breakdown for silver (per ounce): 999 / 958 / 925 / 900 / 800. */
  finenessPrices: Record<string, number> | null;
  /** Trend derived from change %: >= +0.5 up, <= -0.5 down, else flat. */
  trend: TrendSignal;
};

export type PremiumMetalAnalysis = {
  currency: MetalCurrency;
  gold: MetalQuote | null;
  silver: MetalQuote | null;
  fetchedAt: string;
};

export type MetalPrices = PremiumMetalAnalysis;

const HOST = "metal-sentinel.p.rapidapi.com";
const BASE_URL = `https://${HOST}/api/v1`;

export function metalsConfigured(): boolean {
  return Boolean(process.env.RAPIDAPI_KEY);
}

type VendorQuote = {
  symbol?: string;
  currency?: string;
  ask?: number | null;
  mid?: number | null;
  bid?: number | null;
  high?: number | null;
  low?: number | null;
  timestamp?: number | null;
  change?: number | null;
  changePercentage?: number | null;
  karat_prices?: Record<string, number> | null;
  fineness_prices?: Record<string, number> | null;
};

type VendorResponse = {
  results?: VendorQuote[];
};

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toPriceMap(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function trendFrom(changePercentage: number | null): TrendSignal {
  if (changePercentage === null) return "flat";
  if (changePercentage >= 0.5) return "up";
  if (changePercentage <= -0.5) return "down";
  return "flat";
}

function normalizeQuote(
  symbol: string,
  currency: MetalCurrency,
  raw: VendorQuote | undefined,
): MetalQuote | null {
  if (!raw) return null;
  const changePercentage = toNumber(raw.changePercentage);
  return {
    symbol,
    currency,
    mid: toNumber(raw.mid),
    bid: toNumber(raw.bid),
    ask: toNumber(raw.ask),
    high: toNumber(raw.high),
    low: toNumber(raw.low),
    change: toNumber(raw.change),
    changePercentage,
    timestamp: toNumber(raw.timestamp),
    karatPrices: toPriceMap(raw.karat_prices),
    finenessPrices: toPriceMap(raw.fineness_prices),
    trend: trendFrom(changePercentage),
  };
}

async function fetchQuote(
  metal: "gold" | "silver",
  currency: MetalCurrency,
  key: string,
): Promise<MetalQuote | null> {
  const response = await fetch(`${BASE_URL}/${metal}-price?currency=${currency}`, {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": HOST,
    },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Metal Sentinel rejected the RapidAPI key (401/403)");
  }
  if (response.status === 429) throw new Error("Metal Sentinel rate limit reached (429)");
  if (!response.ok) throw new Error(`Metal Sentinel responded ${response.status}`);

  const payload = (await response.json().catch(() => null)) as VendorResponse | null;
  const raw = payload?.results?.[0];
  return normalizeQuote(metal === "gold" ? "AU" : "AG", currency, raw);
}

/**
 * Premium analysis: full day-range + karat/fineness + trend per metal.
 * Throws when the key is missing or the vendor fails — the caller (API route)
 * maps that to 503 so a broken feed never charges tokens.
 */
export async function getPremiumMetalAnalysis(
  currency: MetalCurrency,
): Promise<PremiumMetalAnalysis> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY is not configured");

  const [gold, silver] = await Promise.all([
    fetchQuote("gold", currency, key),
    fetchQuote("silver", currency, key),
  ]);

  return { currency, gold, silver, fetchedAt: new Date().toISOString() };
}

/** Backwards-compatible alias: the metered route serves premium analysis. */
export const getMetalPrices = getPremiumMetalAnalysis;

/** Region -> billing currency. OTHER has no local quote, defaults to MYR. */
export function metalCurrencyForRegion(region: string): MetalCurrency {
  return region === "ID" ? "IDR" : "MYR";
}

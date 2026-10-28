/**
 * Goldprice.dev — FREE public metals feed for the homepage widget.
 *
 * Boss spec Task 1: `getPublicMetalPrices()` with GOLDPRICE_API_KEY, cached
 * 4 hours so the free quota is not burned on every page load.
 *
 * Vendor: `GET https://api.goldprice.dev/v1/prices?symbol=XAU-USD-SPOT` with
 * `Authorization: Bearer KEY` (or `X-API-Key` alias). Response:
 * `{ symbols: [{ symbol, quote_currency, unit, price, is_stale, computed_at }] }`
 * with price as a DECIMAL STRING in USD per troy ounce.
 *
 * Conversion: USD -> MYR x4.70, USD -> IDR x16000 (Boss fixed rates for now).
 * A `?currency=` override is NOT accepted on the free path: the homepage shows
 * the visitor's own region currency, never a picked one.
 *
 * Cache: module-memory TTL (4h) + Supabase `metal_price_cache` row when the
 * DB is configured, so a Worker restart / second instance does not stampede
 * the free quota either. Stale cache is served rather than failing the page.
 */

export type PublicMetalCurrency = "MYR" | "IDR";

export type PublicMetalPrices = {
  currency: PublicMetalCurrency;
  /** Converted spot per troy ounce, in the display currency. */
  gold: number | null;
  silver: number | null;
  /** Where the numbers came from: live vendor call or cache. */
  source: "live" | "cache";
  fetchedAt: string;
};

/** Boss fixed rates (for now — revisit when a forex feed lands). */
const MYR_PER_USD = 4.7;
const IDR_PER_USD = 16_000;

/** 4 hours, per the Boss spec. */
const CACHE_TTL_MS = 4 * 60 * 60 * 1_000;

const GOLD_SYMBOL = "XAU-USD-SPOT";
const SILVER_SYMBOL = "XAG-USD-SPOT";

type VendorSymbol = {
  symbol?: string;
  quote_currency?: string;
  unit?: string;
  price?: string | number | null;
  is_stale?: boolean;
  computed_at?: string;
};

type VendorResponse = {
  symbols?: VendorSymbol[];
};

type CacheEntry = { prices: PublicMetalPrices; expiresAt: number };

let memoryCache: CacheEntry | null = null;

export function goldpriceConfigured(): boolean {
  return Boolean(process.env.GOLDPRICE_API_KEY);
}

function toUsd(value: VendorSymbol["price"]): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

function convert(usd: number | null, currency: PublicMetalCurrency): number | null {
  if (usd === null) return null;
  const rate = currency === "IDR" ? IDR_PER_USD : MYR_PER_USD;
  return Math.round(usd * rate * 100) / 100;
}

function pickPrice(symbols: VendorSymbol[] | undefined, want: "XAU" | "XAG"): number | null {
  const row = symbols?.find((s) => s.symbol === want);
  return toUsd(row?.price);
}

async function fetchLive(currency: PublicMetalCurrency): Promise<PublicMetalPrices> {
  const key = process.env.GOLDPRICE_API_KEY;
  if (!key) throw new Error("GOLDPRICE_API_KEY is not configured");

  const response = await fetch(
    `https://api.goldprice.dev/v1/prices?symbol=${GOLD_SYMBOL}&symbol=${SILVER_SYMBOL}`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    },
  );

  if (response.status === 401) throw new Error("Goldprice.dev rejected the API key (401)");
  if (response.status === 429) throw new Error("Goldprice.dev rate limit reached (429)");
  if (!response.ok) throw new Error(`Goldprice.dev responded ${response.status}`);

  const payload = (await response.json().catch(() => null)) as VendorResponse | null;
  const gold = convert(pickPrice(payload?.symbols, "XAU"), currency);
  const silver = convert(pickPrice(payload?.symbols, "XAG"), currency);

  return { currency, gold, silver, source: "live", fetchedAt: new Date().toISOString() };
}

/**
 * Free homepage feed with a 4-hour cache. Memory is checked first, then the
 * Supabase `metal_price_cache` row (shared across instances), then the vendor.
 * A vendor failure with a usable (even expired) cache serves the cache with
 * `source: "cache"` rather than breaking the homepage. Null only when there is
 * genuinely nothing to show.
 */
export async function getPublicMetalPrices(
  currency: PublicMetalCurrency,
): Promise<PublicMetalPrices | null> {
  const now = Date.now();

  if (memoryCache && memoryCache.expiresAt > now && memoryCache.prices.currency === currency) {
    return { ...memoryCache.prices, source: "cache" };
  }

  const dbRow = await readDbCache(currency);
  if (dbRow && dbRow.expiresAt > now) {
    memoryCache = { prices: dbRow.prices, expiresAt: dbRow.expiresAt };
    return { ...dbRow.prices, source: "cache" };
  }

  try {
    const live = await fetchLive(currency);
    const expiresAt = Date.now() + CACHE_TTL_MS;
    memoryCache = { prices: live, expiresAt };
    await writeDbCache(live, expiresAt).catch(() => {});
    return live;
  } catch (error) {
    console.error("[jutaone] goldprice fetch failed", (error as Error).message.slice(0, 160));
    if (dbRow) {
      memoryCache = { prices: dbRow.prices, expiresAt: now + 30 * 60_000 };
      return { ...dbRow.prices, source: "cache" };
    }
    return null;
  }
}

type DbRow = { currency: string; gold: number | null; silver: number | null; fetched_at: string; expires_at: string };

async function readDbCache(currency: PublicMetalCurrency): Promise<{ prices: PublicMetalPrices; expiresAt: number } | null> {
  try {
    const { getSupabase } = await import("@/lib/db");
    const db = getSupabase();
    if (!db) return null;
    const { data } = await db
      .from("metal_price_cache")
      .select("currency, gold, silver, fetched_at, expires_at")
      .eq("currency", currency)
      .maybeSingle();
    const row = data as DbRow | null;
    if (!row) return null;
    return {
      prices: {
        currency,
        gold: typeof row.gold === "number" ? row.gold : null,
        silver: typeof row.silver === "number" ? row.silver : null,
        source: "cache",
        fetchedAt: row.fetched_at,
      },
      expiresAt: new Date(row.expires_at).getTime(),
    };
  } catch {
    return null;
  }
}

async function writeDbCache(prices: PublicMetalPrices, expiresAt: number): Promise<void> {
  const { getSupabase } = await import("@/lib/db");
  const db = getSupabase();
  if (!db) return;
  await db.from("metal_price_cache").upsert(
    {
      currency: prices.currency,
      gold: prices.gold,
      silver: prices.silver,
      fetched_at: prices.fetchedAt,
      expires_at: new Date(expiresAt).toISOString(),
    },
    { onConflict: "currency" },
  );
}

/** Region -> display currency. OTHER has no local quote, defaults to MYR. */
export function publicCurrencyForRegion(region: string): PublicMetalCurrency {
  return region === "ID" ? "IDR" : "MYR";
}

/** Test helper: clears the in-memory entry so tests do not leak state. */
export function __clearGoldpriceMemoryCache(): void {
  memoryCache = null;
}

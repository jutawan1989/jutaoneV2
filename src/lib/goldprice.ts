/**
 * Goldprice.dev — FREE public metals feed for the homepage widget.
 *
 * Boss spec Task 1: `getPublicMetalPrices()` with GOLDPRICE_API_KEY, cached
 * 4 hours so the free quota is not burned on every page load.
 *
 * Vendor: `GET https://api.goldprice.dev/v1/prices?symbol=XAU-USD-SPOT` with
 * `Authorization: Bearer *** (or `X-API-Key` alias). Response:
 * `{ symbols: [{ symbol, quote_currency, unit, price, is_stale, computed_at }] }`
 * with price as a DECIMAL STRING in USD per troy ounce. NOTE: the `symbol`
 * field in the RESPONSE is the bare code (`XAU`/`XAG`), not the full
 * `XAU-USD-SPOT` request form — match on the bare code.
 *
 * Production lesson (2026-10-28): with no/invalid key, a COMBINED request
 * (`?symbol=XAU-USD-SPOT&symbol=XAG-USD-SPOT`) returns only the XAG row, so
 * gold came back null while silver worked. Fix: fetchLive now fills each
 * missing metal via a keyless single-symbol request, then via the keyless
 * gold-api.com fallback (`GET https://api.gold-api.com/price/XAU` ->
 * `{ price: number, currency: "USD" }`). The auth header is only sent when
 * GOLDPRICE_API_KEY is actually set — an empty `Bearer` header is what
 * triggered the gated combined response.
 *
 * Conversion: USD -> MYR x4.70, USD -> IDR x16000 (Boss fixed rates for now),
 * USD stays raw (international spot, 2dp).
 * A `?currency=` override is NOT accepted on the free path: the homepage shows
 * the visitor's own region currency, never a picked one.
 *
 * Cache: module-memory TTL (4h) + Supabase `metal_price_cache` row when the
 * DB is configured, so a Worker restart / second instance does not stampede
 * the free quota either. Stale cache is served rather than failing the page.
 */

export type PublicMetalCurrency = "USD" | "MYR" | "IDR";

/**
 * Spot per troy ounce. `usd` is the vendor truth — always present when the
 * feed is up. `myr`/`idr` are converted views of the same numbers (Boss fixed
 * rates), so the frontend formats ONE field with Intl.NumberFormat and never
 * re-derives FX itself. Null only when the vendor row is missing.
 */
export type PublicMetalPrices = {
  currency: PublicMetalCurrency;
  usd: { gold: number | null; silver: number | null };
  /** Converted spot per troy ounce, in the display currency. */
  gold: number | null;
  silver: number | null;
  /** Same numbers converted to the other two currencies (clean floats). */
  myr: { gold: number | null; silver: number | null };
  idr: { gold: number | null; silver: number | null };
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
  if (currency === "USD") return Math.round(usd * 100) / 100;
  const rate = currency === "IDR" ? IDR_PER_USD : MYR_PER_USD;
  return Math.round(usd * rate * 100) / 100;
}

function pickPrice(symbols: VendorSymbol[] | undefined, want: "XAU" | "XAG"): number | null {
  const row = symbols?.find((s) => s.symbol === want);
  return toUsd(row?.price);
}

function authHeaders(): Record<string, string> {
  // Only send the auth header when a key is actually configured. An empty
  // `Bearer` header triggers a gated keyless response (XAU row dropped).
  const key = process.env.GOLDPRICE_API_KEY?.trim();
  return key ? { authorization: `Bearer ${key}` } : {};
}

async function fetchSingleUsd(fullSymbol: string, want: "XAU" | "XAG"): Promise<number | null> {
  try {
    const response = await fetch(`https://api.goldprice.dev/v1/prices?symbol=${fullSymbol}`, {
      method: "GET",
      headers: authHeaders(),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as VendorResponse | null;
    return pickPrice(payload?.symbols, want);
  } catch {
    return null;
  }
}

/** Keyless fallback for gold only: GET https://api.gold-api.com/price/XAU -> { price, currency }. */
async function fetchGoldApiFallbackUsd(symbol: "XAU" | "XAG"): Promise<number | null> {
  try {
    const response = await fetch(`https://api.gold-api.com/price/${symbol}`, {
      method: "GET",
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as {
      price?: number;
      currency?: string;
    } | null;
    const n = typeof payload?.price === "number" ? payload.price : Number(payload?.price);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

async function fetchLive(currency: PublicMetalCurrency): Promise<PublicMetalPrices> {
  const response = await fetch(
    `https://api.goldprice.dev/v1/prices?symbol=${GOLD_SYMBOL}&symbol=${SILVER_SYMBOL}`,
    {
      method: "GET",
      headers: authHeaders(),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    },
  );

  if (response.status === 401) throw new Error("Goldprice.dev rejected the API key (401)");
  if (response.status === 429) throw new Error("Goldprice.dev rate limit reached (429)");
  if (!response.ok) throw new Error(`Goldprice.dev responded ${response.status}`);

  const payload = (await response.json().catch(() => null)) as VendorResponse | null;
  let goldUsd = pickPrice(payload?.symbols, "XAU");
  let silverUsd = pickPrice(payload?.symbols, "XAG");

  // The combined request can legally omit a row (observed: keyless call
  // returns XAG only). Backfill each missing metal separately rather than
  // blanking the widget. Order: single-symbol goldprice.dev, then gold-api.
  if (goldUsd === null) goldUsd = (await fetchSingleUsd(GOLD_SYMBOL, "XAU")) ?? (await fetchGoldApiFallbackUsd("XAU"));
  if (silverUsd === null) silverUsd = (await fetchSingleUsd(SILVER_SYMBOL, "XAG")) ?? (await fetchGoldApiFallbackUsd("XAG"));

  if (goldUsd === null && silverUsd === null) throw new Error("Goldprice.dev returned no usable rows");

  const gold = convert(goldUsd, currency);
  const silver = convert(silverUsd, currency);

  // Ali: every response carries all three quotes as clean floats so the
  // frontend formats ONE field with Intl.NumberFormat (no FX re-derivation).
  // `usd` is vendor truth; myr/idr are views at Boss fixed rates.
  const usd = { gold: convert(goldUsd, "USD"), silver: convert(silverUsd, "USD") };
  const myr = { gold: convert(goldUsd, "MYR"), silver: convert(silverUsd, "MYR") };
  const idr = { gold: convert(goldUsd, "IDR"), silver: convert(silverUsd, "IDR") };

  return { currency, usd, gold, silver, myr, idr, source: "live", fetchedAt: new Date().toISOString() };
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

type DbRow = { currency: string; gold: number | null; silver: number | null; usd_gold: number | null; usd_silver: number | null; myr_gold: number | null; myr_silver: number | null; idr_gold: number | null; idr_silver: number | null; fetched_at: string; expires_at: string };

function asFloat(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

async function readDbCache(currency: PublicMetalCurrency): Promise<{ prices: PublicMetalPrices; expiresAt: number } | null> {
  try {
    const { getSupabase } = await import("@/lib/db");
    const db = getSupabase();
    if (!db) return null;
    const { data } = await db
      .from("metal_price_cache")
      .select("currency, gold, silver, usd_gold, usd_silver, myr_gold, myr_silver, idr_gold, idr_silver, fetched_at, expires_at")
      .eq("currency", currency)
      .maybeSingle();
    const row = data as DbRow | null;
    if (!row) return null;
    // Old rows predate the tri-quote columns: rebuild myr/idr/usd from the
    // stored display gold/silver so the widget still gets clean floats.
    const gold = asFloat(row.gold);
    const silver = asFloat(row.silver);
    const usd = {
      gold: asFloat(row.usd_gold) ?? (currency === "USD" ? gold : gold !== null ? convert(gold / (currency === "IDR" ? IDR_PER_USD : MYR_PER_USD), "USD") : null),
      silver: asFloat(row.usd_silver) ?? (currency === "USD" ? silver : silver !== null ? convert(silver / (currency === "IDR" ? IDR_PER_USD : MYR_PER_USD), "USD") : null),
    };
    return {
      prices: {
        currency,
        usd,
        gold,
        silver,
        myr: { gold: asFloat(row.myr_gold) ?? convert(usd.gold, "MYR"), silver: asFloat(row.myr_silver) ?? convert(usd.silver, "MYR") },
        idr: { gold: asFloat(row.idr_gold) ?? convert(usd.gold, "IDR"), silver: asFloat(row.idr_silver) ?? convert(usd.silver, "IDR") },
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
      usd_gold: prices.usd.gold,
      usd_silver: prices.usd.silver,
      myr_gold: prices.myr.gold,
      myr_silver: prices.myr.silver,
      idr_gold: prices.idr.gold,
      idr_silver: prices.idr.silver,
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

/** Active locale -> widget currency (ms=MYR, id=IDR, en=USD raw spot). */
export function publicCurrencyForLocale(locale: string): PublicMetalCurrency {
  if (locale === "id") return "IDR";
  if (locale === "en") return "USD";
  return "MYR";
}

/** Test helper: clears the in-memory entry so tests do not leak state. */
export function __clearGoldpriceMemoryCache(): void {
  memoryCache = null;
}

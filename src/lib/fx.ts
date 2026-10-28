/**
 * RM-anchored FX rates for checkout.
 *
 * Boss spec: the base currency is RM (Ringgit Malaysia). Display prices and
 * the internal anchor are always computed from RM; foreign currencies (IDR,
 * USD) are derived via this module so there is exactly ONE place where FX
 * lives instead of a magic number copied into pricing/goldprice/checkout.
 *
 * Sources, in order:
 *   1. `FX_RM_TO_IDR` / `FX_RM_TO_USD` env overrides (static, exact — Boss's
 *      "simpan kadar statik di .env buat masa ini"). Takes precedence so an
 *      ops-set rate is never silently replaced by a drifting feed.
 *   2. Free live feed `https://open.er-api.com/v6/latest/MYR` (no key,
 *      ~daily refresh). `rates.IDR` is IDR-per-MYR, `rates.USD` is USD-per-MYR.
 *   3. Built-in fallback (RM 1 = Rp 3,600 ≈ IDR_PER_USD 16,000 at 4.70):
 *      guarantees checkout still prices when the feed is down.
 *
 * Cached in memory for 6 hours — FX moves slowly and the free feed is
 * rate-limited. `getExchangeRate("IDR")` returns IDR-per-RM; divide, never
 * multiply, when converting the other way.
 */

export type FxCurrency = "IDR" | "USD";

/** Static fallback: RM 1 = Rp 3,600 (matches IDR_PER_USD 16,200 at 4.50). */
export const FALLBACK_RM_TO_IDR = 3_600;
/** Static fallback: RM 1 ≈ $0.2222 (MYR_PER_USD 4.50). */
export const FALLBACK_RM_TO_USD = 1 / 4.5;

const FEED_URL = "https://open.er-api.com/v6/latest/MYR";
const CACHE_TTL_MS = 6 * 60 * 60 * 1_000;

type FxCache = { idr: number; usd: number; expiresAt: number };
let cache: FxCache | null = null;

function envRate(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function envOverride(): FxCache | null {
  const idr = envRate("FX_RM_TO_IDR");
  const usd = envRate("FX_RM_TO_USD");
  if (idr === null && usd === null) return null;
  return {
    idr: idr ?? FALLBACK_RM_TO_IDR,
    usd: usd ?? FALLBACK_RM_TO_USD,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

async function fetchLive(): Promise<FxCache | null> {
  try {
    const response = await fetch(FEED_URL, {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as {
      result?: string;
      rates?: Record<string, number>;
    } | null;
    if (payload?.result !== "success") return null;
    const idr = Number(payload.rates?.IDR);
    const usd = Number(payload.rates?.USD);
    if (!Number.isFinite(idr) || idr <= 0 || !Number.isFinite(usd) || usd <= 0) return null;
    return { idr, usd, expiresAt: Date.now() + CACHE_TTL_MS };
  } catch {
    return null;
  }
}

/**
 * IDR-per-RM (default) or USD-per-RM. Never throws: falls back to env
 * statics, then to the built-in constants, so checkout always has a rate.
 */
export async function getExchangeRate(currency: FxCurrency = "IDR"): Promise<number> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return currency === "IDR" ? cache.idr : cache.usd;

  cache = envOverride() ?? (await fetchLive()) ?? {
    idr: FALLBACK_RM_TO_IDR,
    usd: FALLBACK_RM_TO_USD,
    expiresAt: now + CACHE_TTL_MS,
  };
  return currency === "IDR" ? cache.idr : cache.usd;
}

/**
 * Round a rupiah charge to a "cantik" number. Rounds to the nearest 500 for
 * amounts under Rp 100,000, nearest 1,000 above — never below 500 so Chip
 * never receives a zero/negative charge.
 */
export function roundIdr(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 500;
  const step = amount < 100_000 ? 500 : 1_000;
  return Math.max(500, Math.round(amount / step) * step);
}

/**
 * CMO margin floor (Linda): the Indonesian checkout charge never drops below
 * Rp16,000 for the $1 base, even when MYR strengthens and the raw conversion
 * (RM base × rate) would land lower. Scales linearly for larger USD amounts.
 */
export const IDR_FLOOR_PER_USD = 16_000;

/** Applies the floor, then `roundIdr`, so Chip always gets a cantik amount. */
export function applyIdrFloor(rawIdr: number, usd: number): number {
  const floored = Math.max(rawIdr, IDR_FLOOR_PER_USD * usd);
  return roundIdr(floored);
}

/** Test helper: clears the in-memory rate so tests do not leak state. */
export function __clearFxCache(): void {
  cache = null;
}

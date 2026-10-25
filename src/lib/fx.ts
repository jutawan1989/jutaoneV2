import { getSupabase, supabaseConfigured } from "@/lib/db";
import { fxFromEnv, type FxRates } from "@/lib/pricing";

/**
 * FX rates come from Supabase (`fx_rates`), falling back to
 * `USD_TO_MYR_RATE` / `USD_TO_IDR_RATE` and finally to the hardcoded defaults.
 *
 * The fallback chain matters for checkout: a database hiccup must not stop a
 * customer from paying. It also stays visible — `source` is carried through to
 * the logged top-up, so a stale rate is discoverable after the fact instead of
 * silently mispricing revenue.
 *
 * Cached per isolate for a minute: FX moves slowly, and a top-up page render
 * should not cost a database round trip per request.
 */
const CACHE_TTL_MS = 60_000;

let cached: { rates: FxRates; expiresAt: number } | null = null;

export async function getFxRates(): Promise<FxRates> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.rates;

  const rates = await loadFromDatabase();
  cached = { rates, expiresAt: now + CACHE_TTL_MS };
  return rates;
}

async function loadFromDatabase(): Promise<FxRates> {
  const db = supabaseConfigured() ? getSupabase() : null;
  if (!db) return fxFromEnv();

  try {
    const { data, error } = await db
      .from("fx_rates")
      .select("currency, rate, effective_from")
      .in("currency", ["MYR", "IDR"])
      .order("effective_from", { ascending: false });

    if (error || !data?.length) return fxFromEnv();

    // Rows are ordered newest first, so the first hit per currency is the
    // current rate.
    const latest = new Map<string, number>();
    for (const row of data as Array<{ currency: string; rate: number | string }>) {
      if (!latest.has(row.currency)) latest.set(row.currency, Number(row.rate));
    }

    const env = fxFromEnv();
    const myr = latest.get("MYR");
    const idr = latest.get("IDR");
    if (!isUsable(myr) || !isUsable(idr)) {
      // A partial table is worse than none: mixing a live rate with a stale one
      // would price the two markets inconsistently.
      console.warn("[jutaone] fx_rates is incomplete, using env rates");
      return env;
    }

    return { MYR: myr, IDR: idr, source: "db" };
  } catch (error) {
    console.warn("[jutaone] fx_rates lookup failed, using env rates", error);
    return fxFromEnv();
  }
}

function isUsable(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Test seam: forget the cached rates. */
export function resetFxCache(): void {
  cached = null;
}

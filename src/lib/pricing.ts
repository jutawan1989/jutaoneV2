import type { Locale, Region } from "@/lib/i18n/config";

export type CurrencyCode = "USD" | "MYR" | "IDR";

/**
 * Prices are quoted from a single USD base so one commercial decision (what a
 * top-up costs) does not have to be repeated in three currencies.
 *
 * `BASE_PRICE_USD_CENTS` is the source of truth for the display price. Local
 * amounts are derived from it at request time; the base USD amount is what gets
 * recorded on the top-up, so reporting never depends on an FX snapshot.
 *
 * Chip's hosted checkout is charged in the visitor's local currency: a MYR/IDR
 * purchase is what a Malaysian or Indonesian card can actually complete, and
 * Chip.Asia's FPX and DuitNow rails are MYR-only.
 */
export const BASE_PRICE_USD_CENTS = 100;
export const TOKENS_PER_UNIT = 1_000_000;

/** Fallbacks only; the live rates come from `fx_rates` in Supabase. */
const DEFAULT_FX: Record<"MYR" | "IDR", number> = { MYR: 4.7, IDR: 16_000 };

export type Price = {
  /** Local currency actually charged at checkout. */
  currency: CurrencyCode;
  /** Local amount in major units, i.e. 4.7 or 16000. */
  amount: number;
  /** Chip.Asia expects integer minor units (sen / rupiah / cents). */
  amountMinor: number;
  /** Human display string, e.g. `RM4.70` or `Rp16,000`. */
  display: string;
  /** Base price in US cents — the value recorded on the top-up. */
  baseUsdCents: number;
  /** Human display of the base price, e.g. `$1.00`. */
  baseDisplay: string;
  /** Token grant for one top-up. */
  tokens: number;
  /** FX rate used for the local amount, e.g. 4.7 (1 USD = 4.70 MYR). */
  fxRate: number;
  /** Where `fxRate` came from, so a stale fallback is visible in logs. */
  fxSource: "db" | "env" | "default";
  tokensLabel: Record<Locale, string>;
};

export type FxRates = {
  MYR: number;
  IDR: number;
  source: "db" | "env" | "default";
};

function readPositive(name: string): number | null {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

/**
 * Rates from `USD_TO_MYR_RATE` / `USD_TO_IDR_RATE`. Used when Supabase is
 * unreachable or the `fx_rates` table has not been populated yet, so a database
 * blip degrades to an env rate instead of breaking checkout.
 */
export function fxFromEnv(): FxRates {
  const myr = readPositive("USD_TO_MYR_RATE");
  const idr = readPositive("USD_TO_IDR_RATE");
  return {
    MYR: myr ?? DEFAULT_FX.MYR,
    IDR: idr ?? DEFAULT_FX.IDR,
    source: myr || idr ? "env" : "default",
  };
}

const TOKEN_LABEL: Record<Locale, string> = {
  en: "1 Million Tokens",
  ms: "1 Juta Token",
  id: "1 Juta Token",
};

function roundMinor(value: number): number {
  return Math.round(value);
}

function formatLocal(currency: "MYR" | "IDR", minorUnits: number): string {
  const whole = minorUnits / 100;
  if (currency === "MYR") {
    // RM has 2 decimals: 470 sen -> "RM4.70", 300 sen -> "RM3" (trailing zeros dropped).
    const text = Number.isInteger(whole) ? String(whole) : whole.toFixed(2);
    return `RM${text}`;
  }
  // IDR is a 2-decimal currency at Chip: the same 100-scaling that turns 470
  // into RM4.70 turns 1600000 into Rp16,000.00, grouped the Indonesian way
  // (dot separator, comma decimal).
  return `Rp${whole.toLocaleString("id-ID", {
    minimumFractionDigits: whole % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Major units of the local currency for the base price.
 *
 * Both currencies expose two decimals at Chip, so the conversion is
 * `usd * rate` and the minor unit is always `* 100`. Verified against the
 * gateway: sending 16000 for IDR renders "Rp160.00", and 1600000 renders
 * "Rp16,000.00" — sending whole rupiah would have undercharged by 100x.
 */
function localMajor(usdCents: number, rate: number): number {
  return (usdCents / 100) * rate;
}

/**
 * Builds the local price for a region from the USD base and an FX rate.
 *
 * Rounding matters: the local amount is rounded to the currency's smallest
 * unit, so the company either absorbs or gains a fraction of a cent. That is
 * deliberate and recorded — the base USD figure is what the ledger keeps.
 */
export function getPrice(region: Region, rates: FxRates = fxFromEnv()): Price {
  return getPriceForUsd(BASE_PRICE_USD_CENTS, region, rates);
}

/** Smallest top-up the API will charge. */
export const MIN_TOPUP_USD_CENTS = 100;
/** Ceiling that keeps a fat-fingered "1000" from becoming a five-figure charge. */
export const MAX_TOPUP_USD_CENTS = 50_000;

/**
 * Same conversion as `getPrice`, for an arbitrary USD amount.
 *
 * Tokens are strictly `usd * 1,000,000`, so the grant is derived from the base
 * price rather than the rounded local charge: a customer paying RM23.50 for $5
 * gets exactly 5,000,000 tokens, not the count implied by RM23.50.
 */
export function getPriceForUsd(
  usdCents: number,
  region: Region,
  rates: FxRates = fxFromEnv(),
): Price {
  const baseDisplay = `$${(usdCents / 100).toFixed(2)}`;
  const tokens = Math.round((usdCents / 100) * TOKENS_PER_UNIT);

  if (region === "ID") {
    const fxRate = rates.IDR;
    const amountMinor = roundMinor(localMajor(usdCents, fxRate) * 100);
    return {
      currency: "IDR",
      amount: amountMinor / 100,
      amountMinor,
      display: formatLocal("IDR", amountMinor),
      baseUsdCents: usdCents,
      baseDisplay,
      tokens,
      fxRate,
      fxSource: rates.source,
      tokensLabel: TOKEN_LABEL,
    };
  }

  // MY and everything else are charged in ringgit, as before: outside MY/ID the
  // visitor still pays the MYR price rather than a USD price they were never
  // quoted.
  const fxRate = rates.MYR;
  const amountMinor = roundMinor(localMajor(usdCents, fxRate) * 100);
  return {
    currency: "MYR",
    amount: amountMinor / 100,
    amountMinor,
    display: formatLocal("MYR", amountMinor),
    baseUsdCents: usdCents,
    baseDisplay,
    tokens,
    fxRate,
    fxSource: rates.source,
    tokensLabel: TOKEN_LABEL,
  };
}

/**
 * Validates a client-supplied USD amount.
 *
 * The client proposes, the server decides: the amount is parsed here and the
 * tokens are recomputed from it, never taken from the request body.
 */
export function parseTopUpUsdCents(
  raw: unknown,
):
  | { ok: true; usdCents: number }
  | { ok: false; code: "amount_invalid" | "amount_below_minimum" | "amount_above_maximum" } {
  const numeric =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return { ok: false, code: "amount_invalid" };

  // Whole cents only: a request for $1.005 must not silently become $1.01.
  const usdCents = Math.round(numeric * 100);
  if (Math.abs(numeric * 100 - usdCents) > 1e-6) return { ok: false, code: "amount_invalid" };
  if (usdCents < MIN_TOPUP_USD_CENTS) return { ok: false, code: "amount_below_minimum" };
  if (usdCents > MAX_TOPUP_USD_CENTS) return { ok: false, code: "amount_above_maximum" };

  return { ok: true, usdCents };
}

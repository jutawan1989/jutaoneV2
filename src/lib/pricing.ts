import type { Locale, Region } from "@/lib/i18n/config";

export type CurrencyCode = "MYR" | "IDR" | "USD";

export type Price = {
  /** Currency actually charged at checkout, per billing region. */
  currency: CurrencyCode;
  /** Top-up size in USD. The headline price everywhere. */
  usd: number;
  /** Amount charged in major units, e.g. 4.70 or 16000. */
  amount: number;
  /** Chip.Asia expects integer minor units (sen / rupiah / cents). */
  amountMinor: number;
  /** Headline price, always 2 decimals: `$1.00`, `$5.00`. */
  display: string;
  /** ISO code shown beside the headline. */
  usdCode: "USD";
  /** Estimated local charge, e.g. `≈ RM4.70`; null when no estimate applies. */
  localDisplay: string | null;
  /** Tokens granted by this top-up. */
  tokens: number;
  tokensLabel: Record<Locale, string>;
};

/** One USD buys one million tokens. Every amount scales linearly. */
export const TOKENS_PER_USD = 1_000_000;
/** Minimum top-up is $1.00. Above the cap is rejected, not silently clamped. */
export const MIN_TOPUP_USD = 1;
export const MAX_TOPUP_USD = 10_000;

/** Quick-pick buttons on the pricing card. */
export const QUICK_TOPUP_AMOUNTS = [1, 5, 10, 50] as const;

/** Local-charge estimates shown under the USD headline (not a second price). */
const MYR_PER_USD = 4.7;
const IDR_PER_USD = 16_000;

const BASE_CURRENCY: Record<Region, CurrencyCode> = {
  MY: "MYR",
  ID: "IDR",
  OTHER: "USD",
};

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** `5000000, "en"` -> `"5,000,000 Tokens"`; ms/id use `Token`. */
export function formatTokenCount(tokens: number, locale: Locale): string {
  const grouped = tokens.toLocaleString("en-US");
  return locale === "en" ? `${grouped} Tokens` : `${grouped} Token`;
}

/**
 * Accept a user-supplied amount (quick pick or custom input). Returns the
 * validated USD value rounded to cents, or null when it is not a payable
 * amount. Strings are accepted because form inputs and query params arrive
 * as text.
 */
export function parseTopUpAmount(value: unknown): number | null {
  const n =
    typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100) / 100;
  if (cents < MIN_TOPUP_USD || cents > MAX_TOPUP_USD) return null;
  return cents;
}

function localDisplayFor(currency: CurrencyCode, usd: number): string | null {
  if (currency === "MYR") return `\u2248 RM${(usd * MYR_PER_USD).toFixed(2)}`;
  if (currency === "IDR")
    return `\u2248 Rp${Math.round(usd * IDR_PER_USD).toLocaleString("en-US")}`;
  return null;
}

function buildPrice(currency: CurrencyCode, usd: number): Price {
  const tokens = Math.round(usd * TOKENS_PER_USD);
  const amount =
    currency === "MYR" ? usd * MYR_PER_USD : currency === "IDR" ? usd * IDR_PER_USD : usd;
  // Chip treats IDR as a 2-decimal currency, like MYR: sending 16000 renders
  // "Rp160.00" and 1600000 renders "Rp16,000.00". Verified against the gateway,
  // so the minor unit is scaled by 100 for both. Sending whole rupiah
  // undercharged Indonesia by 100x.
  const amountMinor = Math.round(amount * 100);
  return {
    currency,
    usd,
    amount,
    amountMinor,
    display: formatUsd(usd),
    usdCode: "USD",
    localDisplay: localDisplayFor(currency, usd),
    tokens,
    tokensLabel: { en: "1 Million Tokens", ms: "1 Juta Token", id: "1 Juta Token" },
  };
}

/** Base $1.00 price for a region. */
export function getPrice(region: Region): Price {
  return buildPrice(BASE_CURRENCY[region] ?? "USD", MIN_TOPUP_USD);
}

/** Scale a regional base price to the chosen USD amount. */
export function withUsdAmount(base: Price, usd: number): Price {
  return buildPrice(base.currency, usd);
}

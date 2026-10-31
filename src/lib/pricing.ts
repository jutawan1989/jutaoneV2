import type { Locale, Region } from "@/lib/i18n/config";

/**
 * Boss final: every transaction settles in USD. There is no MYR, no IDR,
 * no regional amount — $1.00 USD buys 1,000,000 tokens everywhere.
 */
export type CurrencyCode = "USD";

export type Price = {
  /** Currency actually charged at checkout. Always USD. */
  currency: CurrencyCode;
  /** Top-up size in USD. The internal anchor every amount scales from. */
  usd: number;
  /** Amount charged in major units, e.g. 1.00 or 5.00. Always equals `usd`. */
  amount: number;
  /** Integer USD cents, e.g. 100 for $1.00. Stripe `unit_amount` and bigint `topups.amount`. */
  amountMinor: number;
  /** Headline price, always USD with 2 decimals: `$1.00`, `$5.00`. */
  display: string;
  /** ISO code shown beside the headline. Always USD. */
  baseCode: "USD";
  /**
   * No secondary estimate: the headline IS the charge. Always null.
   * Kept (instead of deleting the field) so every `Price` consumer —
   * hero, navbar, pricing card, top-up page — compiles unchanged.
   */
  localDisplay: null;
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

/** Headline formatter: `$1` -> `$1.00`. The ONLY money formatter for checkout. */
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

function buildPrice(usd: number): Price {
  const tokens = Math.round(usd * TOKENS_PER_USD);
  const amountMinor = Math.round(usd * 100);
  return {
    currency: "USD",
    usd,
    amount: usd,
    amountMinor,
    display: formatUsd(usd),
    baseCode: "USD",
    localDisplay: null,
    tokens,
    tokensLabel: { en: "1 Million Tokens", ms: "1 Juta Token", id: "1 Juta Token" },
  };
}

/**
 * Base $1.00 price. `region`/`locale` are accepted so every existing caller
 * keeps compiling, but they no longer affect the price — every market pays USD.
 */
export function getPrice(region?: Region, locale: Locale = "ms"): Price {
  void region;
  void locale;
  return buildPrice(MIN_TOPUP_USD);
}

/** Scale the base price to the chosen USD amount. */
export function withUsdAmount(base: Price, usd: number, locale: Locale = "ms"): Price {
  void base;
  void locale;
  return buildPrice(usd);
}

/**
 * Checkout price. Pure USD passthrough — no FX, no regional amounts.
 *
 * Kept async with `rmBase`/`fxRate` (always null) so the retired
 * Chip/ToyyibPay adapters keep compiling while they are wound down.
 */
export async function priceForCheckout(
  currency: CurrencyCode,
  usd: number,
  locale: Locale = "ms",
): Promise<Price & { rmBase: null; fxRate: null }> {
  void currency;
  void locale;
  const plain = buildPrice(usd);
  return { ...plain, rmBase: null, fxRate: null };
}

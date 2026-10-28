import type { Locale, Region } from "@/lib/i18n/config";

export type CurrencyCode = "MYR" | "IDR" | "USD";

export type Price = {
  /** Currency actually charged at checkout, per billing region. */
  currency: CurrencyCode;
  /** Top-up size in USD. The internal anchor every amount scales from. */
  usd: number;
  /** Amount charged in major units, e.g. 4.70 or 16000. */
  amount: number;
  /** Chip.Asia expects integer minor units (sen / rupiah / cents). */
  amountMinor: number;
  /** Headline price, always in RM with 2 decimals: `RM4.70`, `RM23.50`. */
  display: string;
  /** ISO code shown beside the headline. */
  baseCode: "MYR";
  /**
   * Secondary estimate under the RM headline. Rupiah (`≈ Rp16,000`) when the
   * billing region is Indonesia or the visitor chose Bahasa Indonesia; the
   * USD charged-equivalent (`≈ $1.00`) elsewhere outside Malaysia; null in
   * Malaysia where the headline already is the charge.
   */
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
/**
 * Static IDR anchor. The CHECKOUT path (`priceForCheckout`) overrides this
 * with the live/ops rate from `lib/fx.ts`; this constant only feeds the
 * synchronous display helpers (`formatIdrEstimate`, `getPrice`, and the
 * server-rendered headline) so they stay pure and cacheable.
 */
const IDR_PER_USD = 16_000;

const BASE_CURRENCY: Record<Region, CurrencyCode> = {
  MY: "MYR",
  ID: "IDR",
  OTHER: "USD",
};

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** Headline formatter: the base price is always shown in RM. */
export function formatRm(usd: number): string {
  return `RM${(usd * MYR_PER_USD).toFixed(2)}`;
}

/** Rupiah estimate for Indonesian visitors (IP region or ID language). */
export function formatIdrEstimate(usd: number): string {
  return `\u2248 Rp${Math.round(usd * IDR_PER_USD).toLocaleString("en-US")}`;
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

function localDisplayFor(currency: CurrencyCode, usd: number, locale: Locale): string | null {
  if (currency === "IDR") return formatIdrEstimate(usd);
  // Indonesian by language choice: still show the Rupiah estimate even when
  // the billing region charges MYR or USD.
  if (locale === "id") return formatIdrEstimate(usd);
  // Outside Malaysia/Indonesia the charge is USD: show the charged equivalent
  // under the RM headline so the headline never misleads.
  if (currency === "USD") return `\u2248 ${formatUsd(usd)}`;
  return null;
}

function buildPrice(currency: CurrencyCode, usd: number, locale: Locale): Price {
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
    display: formatRm(usd),
    baseCode: "MYR",
    localDisplay: localDisplayFor(currency, usd, locale),
    tokens,
    tokensLabel: { en: "1 Million Tokens", ms: "1 Juta Token", id: "1 Juta Token" },
  };
}

/** Base $1.00 price for a region. `locale` only affects the Rupiah estimate. */
export function getPrice(region: Region, locale: Locale = "ms"): Price {
  return buildPrice(BASE_CURRENCY[region] ?? "USD", MIN_TOPUP_USD, locale);
}

/** Scale a regional base price to the chosen USD amount. */
export function withUsdAmount(base: Price, usd: number, locale: Locale = "ms"): Price {
  return buildPrice(base.currency, usd, locale);
}

/**
 * Checkout price for Indonesia: RM-anchored via `getExchangeRate()`.
 *
 * Flow: USD amount -> RM base (MYR_PER_USD) -> IDR at the live/ops RM->IDR
 * rate, rounded with `roundIdr` so Chip receives a "cantik" whole-rupiah
 * amount (e.g. Rp16,000) instead of a raw conversion. The RM base is kept on
 * the returned `Price.rmBase` so the callback can record it in Supabase.
 * Non-IDR currencies pass through `withUsdAmount` unchanged.
 */
export async function priceForCheckout(
  currency: CurrencyCode,
  usd: number,
  locale: Locale = "ms",
): Promise<Price & { rmBase: number | null; fxRate: number | null }> {
  if (currency !== "IDR") {
    const plain = buildPrice(currency, usd, locale);
    return { ...plain, rmBase: null, fxRate: null };
  }
  const { getExchangeRate, roundIdr } = await import("@/lib/fx");
  const rate = await getExchangeRate("IDR");
  const rmBase = Math.round(usd * MYR_PER_USD * 100) / 100;
  const idrAmount = roundIdr(rmBase * rate);
  const tokens = Math.round(usd * TOKENS_PER_USD);
  const amountMinor = Math.round(idrAmount * 100);
  return {
    currency: "IDR",
    usd,
    amount: idrAmount,
    amountMinor,
    display: formatRm(usd),
    baseCode: "MYR",
    localDisplay: `≈ Rp${idrAmount.toLocaleString("en-US")}`,
    tokens,
    tokensLabel: { en: "1 Million Tokens", ms: "1 Juta Token", id: "1 Juta Token" },
    rmBase,
    fxRate: rate,
  };
}

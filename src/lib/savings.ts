/**
 * Kalkulator Penjimatan Masa — pure math + currency helpers.
 *
 * Display-only FX for the currency toggle: USD 1 = MYR 4.70 = IDR 17,900.
 * `lib/pricing.ts`). Money is computed in USD, then converted for display —
 * Boss's USD-first direction, with a [USD][MYR][IDR] toggle on top.
 */

export type SavingsCurrency = "USD" | "MYR" | "IDR";

export const SAVINGS_CURRENCIES: readonly SavingsCurrency[] = ["USD", "MYR", "IDR"];

/** Units of foreign currency per 1 USD (display anchors, match pricing.ts). */
export const SAVINGS_FX_PER_USD: Record<SavingsCurrency, number> = {
  USD: 1,
  MYR: 4.7,
  IDR: 17_900,
};

/** Sensible default hourly values, one per currency. */
export const DEFAULT_HOURLY_RATE: Record<SavingsCurrency, number> = {
  USD: 8,
  MYR: 35,
  IDR: 150_000,
};

/** Minutes a merchant spends per caption inside JutaOne (generate + copy). */
export const JUTAONE_MINUTES_PER_AD = 2;
/** Average weeks per month (52 / 12). */
export const WEEKS_PER_MONTH = 4.33;
/** Generous token estimate per caption — 1M tokens cost $1. */
export const TOKENS_PER_AD = 500;
/** Typical monthly JutaOne cost for caption work: one $1 top-up covers it. */
export const JUTAONE_FLAT_USD_PER_MONTH = 1;

export const MIN_ADS_PER_WEEK = 1;
export const MAX_ADS_PER_WEEK = 100;
export const MIN_MINUTES_PER_AD = 1;
export const MAX_MINUTES_PER_AD = 240;

export type SavingsInput = {
  adsPerWeek: number;
  minutesPerAd: number;
  /** Hourly value of the merchant's time, in the selected currency. */
  hourlyRate: number;
  currency: SavingsCurrency;
};

export type SavingsResult = {
  currency: SavingsCurrency;
  adsPerMonth: number;
  hoursManual: number;
  hoursWithJutaOne: number;
  /** Rounded to 1 decimal. */
  hoursSaved: number;
  /** Value of saved time, in the selected currency (rounded for display). */
  moneySaved: number;
  /** Same value in USD (2 decimals) — the ROI anchor. */
  moneySavedUsd: number;
  /** Estimated JutaOne token usage per month. */
  tokensPerMonth: number;
  /** Value saved per $1 of JutaOne cost, rounded to whole multiples. */
  roiMultiple: number;
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function calculateSavings(input: SavingsInput): SavingsResult {
  const currency = SAVINGS_CURRENCIES.includes(input.currency) ? input.currency : "USD";
  const adsPerWeek = Math.round(clamp(input.adsPerWeek, MIN_ADS_PER_WEEK, MAX_ADS_PER_WEEK));
  const minutesPerAd = clamp(input.minutesPerAd, MIN_MINUTES_PER_AD, MAX_MINUTES_PER_AD);
  const hourlyRate = Math.min(1e12, Math.max(0, Number.isFinite(input.hourlyRate) ? input.hourlyRate : 0));

  const fx = SAVINGS_FX_PER_USD[currency];
  const adsPerMonth = adsPerWeek * WEEKS_PER_MONTH;
  const hoursManual = (adsPerMonth * minutesPerAd) / 60;
  const hoursWithJutaOne = (adsPerMonth * JUTAONE_MINUTES_PER_AD) / 60;
  const hoursSaved = Math.max(0, round1(hoursManual - hoursWithJutaOne));

  const hourlyUsd = hourlyRate / fx;
  const moneySavedUsd = Math.round(hoursSaved * hourlyUsd * 100) / 100;
  const moneySaved =
    currency === "IDR" ? Math.round(moneySavedUsd * fx) : Math.round(moneySavedUsd * fx * 100) / 100;

  const tokensPerMonth = Math.round(adsPerMonth * TOKENS_PER_AD);
  const roiMultiple = Math.max(0, Math.round(moneySavedUsd / JUTAONE_FLAT_USD_PER_MONTH));

  return {
    currency,
    adsPerMonth: round1(adsPerMonth),
    hoursManual: round1(hoursManual),
    hoursWithJutaOne: round1(hoursWithJutaOne),
    hoursSaved,
    moneySaved,
    moneySavedUsd,
    tokensPerMonth,
    roiMultiple,
  };
}

/** `1234.5, "USD"` -> `"$1,234.50"`; IDR has no sen: `"Rp1,234,567"`. */
export function formatSavingsMoney(value: number, currency: SavingsCurrency): string {
  const grouped =
    currency === "IDR"
      ? Math.round(value).toLocaleString("en-US")
      : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === "USD") return `$${grouped}`;
  if (currency === "MYR") return `RM${grouped}`;
  return `Rp${grouped}`;
}

/** Default display currency follows the page locale: ms -> MYR, id -> IDR, en -> USD. */
export function defaultSavingsCurrency(locale: string): SavingsCurrency {
  if (locale === "id") return "IDR";
  if (locale === "ms") return "MYR";
  return "USD";
}

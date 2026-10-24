import type { Locale, Region } from "@/lib/i18n/config";

export type CurrencyCode = "MYR" | "IDR";

export type Price = {
  currency: CurrencyCode;
  /** Minor-unit-free amount, i.e. 3.00 or 10000. */
  amount: number;
  /** Chip.Asia expects integer minor units (sen / rupiah cents). */
  amountMinor: number;
  /** Human display string, e.g. `RM3` or `Rp10,000`. */
  display: string;
  /** Tokens granted by one top-up. */
  tokens: number;
  tokensLabel: Record<Locale, string>;
};

/**
 * Commercial model is fixed: RM3 (Malaysia) or Rp10,000 (Indonesia) grants
 * 1 million tokens. Visitors outside MY/ID see the base MYR price, never USD.
 */
const PRICES: Record<Region, Price> = {
  MY: {
    currency: "MYR",
    amount: 3,
    amountMinor: 300,
    display: "RM3",
    tokens: 1_000_000,
    tokensLabel: { en: "1 Million Tokens", ms: "1 Juta Token", id: "1 Juta Token" },
  },
  ID: {
    currency: "IDR",
    amount: 10_000,
    amountMinor: 10_000,
    display: "Rp10,000",
    tokens: 1_000_000,
    tokensLabel: { en: "1 Million Tokens", ms: "1 Juta Token", id: "1 Juta Token" },
  },
  OTHER: {
    currency: "MYR",
    amount: 3,
    amountMinor: 300,
    display: "RM3",
    tokens: 1_000_000,
    tokensLabel: { en: "1 Million Tokens", ms: "1 Juta Token", id: "1 Juta Token" },
  },
};

export function getPrice(region: Region): Price {
  return PRICES[region] ?? PRICES.OTHER;
}

/** Currency name shown in copy, e.g. "RM (MYR)". */
export function currencyLabel(price: Price): string {
  return price.currency;
}

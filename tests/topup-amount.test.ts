import { describe, expect, it } from "vitest";
import {
  MAX_TOPUP_USD_CENTS,
  MIN_TOPUP_USD_CENTS,
  TOKENS_PER_UNIT,
  getPriceForUsd,
  getPrice,
  parseTopUpUsdCents,
  type FxRates,
} from "@/lib/pricing";

const RATES: FxRates = { MYR: 4.7, IDR: 16_000, source: "db" };

describe("dynamic top-up amounts", () => {
  it("grants exactly usd * 1,000,000 tokens", () => {
    expect(getPriceForUsd(100, "MY", RATES).tokens).toBe(1 * TOKENS_PER_UNIT);
    expect(getPriceForUsd(500, "MY", RATES).tokens).toBe(5 * TOKENS_PER_UNIT);
    expect(getPriceForUsd(1000, "MY", RATES).tokens).toBe(10 * TOKENS_PER_UNIT);
  });

  it("derives tokens from the USD base, not the rounded local amount", () => {
    // $5 -> RM23.50. Deriving tokens from RM23.50 would give 5,000,000 by luck,
    // but $1.07 -> RM5.029 (RM5.03) would drift if the local figure were used.
    const price = getPriceForUsd(107, "MY", RATES);
    expect(price.baseUsdCents).toBe(107);
    expect(price.tokens).toBe(1_070_000);
  });

  it("converts a multi-dollar amount to MYR", () => {
    const price = getPriceForUsd(1000, "MY", RATES);
    expect(price.display).toBe("RM47");
    expect(price.amountMinor).toBe(4700);
  });

  it("converts a multi-dollar amount to IDR with the x100 scaling", () => {
    const price = getPriceForUsd(1000, "ID", RATES);
    // $10 * 16000 = Rp160,000 -> 16000000 minor units at Chip's 2 decimals.
    expect(price.amountMinor).toBe(16_000_000);
    expect(price.amount).toBe(160_000);
  });

  it("keeps the single-unit price identical to getPrice", () => {
    for (const region of ["MY", "ID", "OTHER"] as const) {
      expect(getPriceForUsd(100, region, RATES)).toEqual(getPrice(region, RATES));
    }
  });
});

describe("client-supplied amount validation", () => {
  it("accepts a plain dollar amount", () => {
    expect(parseTopUpUsdCents(1)).toEqual({ ok: true, usdCents: 100 });
    expect(parseTopUpUsdCents(5)).toEqual({ ok: true, usdCents: 500 });
    expect(parseTopUpUsdCents("10")).toEqual({ ok: true, usdCents: 1000 });
    expect(parseTopUpUsdCents(2.5)).toEqual({ ok: true, usdCents: 250 });
  });

  it("rejects the minimum boundary correctly", () => {
    expect(parseTopUpUsdCents(1).ok).toBe(true);
    const below = parseTopUpUsdCents(0.99);
    expect(below).toEqual({ ok: false, code: "amount_below_minimum" });
    expect(MIN_TOPUP_USD_CENTS).toBe(100);
  });

  it("rejects amounts above the ceiling", () => {
    const above = parseTopUpUsdCents(MAX_TOPUP_USD_CENTS / 100 + 1);
    expect(above).toEqual({ ok: false, code: "amount_above_maximum" });
  });

  it("rejects junk instead of coercing it", () => {
    for (const raw of [NaN, "", "abc", null, undefined, {}, [], -5, 0, Infinity]) {
      expect(parseTopUpUsdCents(raw)).toEqual({ ok: false, code: "amount_invalid" });
    }
  });

  it("rejects sub-cent precision rather than silently rounding", () => {
    // $1.005 must not become $1.01 without telling the client.
    expect(parseTopUpUsdCents(1.005)).toEqual({ ok: false, code: "amount_invalid" });
  });

  it("does not accept a token count as an amount", () => {
    // A client sending 1,000,000 expecting tokens would be charged $1,000,000
    // worth, so the guard has to reject it.
    expect(parseTopUpUsdCents(1_000_000)).toEqual({
      ok: false,
      code: "amount_above_maximum",
    });
  });
});

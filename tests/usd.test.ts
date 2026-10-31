import { describe, expect, it } from "vitest";
import {
  formatTokenCount,
  formatUsd,
  getPrice,
  MAX_TOPUP_USD,
  MIN_TOPUP_USD,
  parseTopUpAmount,
  QUICK_TOPUP_AMOUNTS,
  TOKENS_PER_USD,
  withUsdAmount,
} from "@/lib/pricing";
import { percentFor } from "@/lib/affiliate";

/**
 * Boss final (100% USD, Stripe only, Kuda Merah 70% in USD cents).
 *
 * $1.00 = 100 cents = 1,000,000 tokens. A $1.00 sale pays 70c commission
 * (L1 50c + L2-19 15c + 5c milestone pool) and the company keeps 30c.
 */
describe("100% USD money contract", () => {
  it("$1.00 buys exactly 1,000,000 tokens", () => {
    expect(TOKENS_PER_USD).toBe(1_000_000);
    expect(getPrice("MY").tokens).toBe(1_000_000);
    expect(getPrice("ID").tokens).toBe(1_000_000);
  });

  it("the base price is $1.00 USD in every market (no RM, no IDR)", () => {
    for (const region of ["MY", "ID", "OTHER"] as const) {
      const price = getPrice(region);
      expect(price.currency).toBe("USD");
      expect(price.usd).toBe(1);
      expect(price.display).toBe("$1.00");
      expect(price.baseCode).toBe("USD");
      expect(price.amountMinor).toBe(100);
      expect(price.localDisplay).toBeNull();
    }
  });

  it("$1.00 travels as 100 integer cents (Stripe unit_amount)", () => {
    const price = withUsdAmount(getPrice("OTHER"), 1);
    expect(price.amountMinor).toBe(100);
    expect(Number.isSafeInteger(price.amountMinor)).toBe(true);
  });

  it("scales linearly: $5.00 = 500c = 5,000,000 tokens", () => {
    const price = withUsdAmount(getPrice("MY"), 5);
    expect(price.display).toBe("$5.00");
    expect(price.amountMinor).toBe(500);
    expect(price.tokens).toBe(5_000_000);
  });

  it("Kuda Merah pays exactly 70c of a $1.00 sale across 19 levels + milestone", () => {
    const grossCents = 100; // $1.00 in integer cents
    let paid = 0;
    for (let level = 1; level <= 19; level++) {
      paid += Math.round((grossCents * percentFor(level)) / 100);
    }
    const milestone = Math.round((grossCents * 5) / 100);
    expect(paid).toBe(65);
    expect(milestone).toBe(5);
    expect(paid + milestone).toBe(70);
    expect(grossCents - (paid + milestone)).toBe(30); // company keeps 30c
  });

  it("level 1 takes 50c of the $1.00 sale (50% direct)", () => {
    expect(Math.round((100 * percentFor(1)) / 100)).toBe(50);
  });

  it("the pricing module exposes no RM/IDR helpers", async () => {
    const pricing = (await import("@/lib/pricing")) as Record<string, unknown>;
    expect(pricing.formatRm).toBeUndefined();
    expect(pricing.formatIdrEstimate).toBeUndefined();
    expect(pricing.TOYYIBPAY_FEE_RM).toBeUndefined();
    expect(pricing.TOYYIBPAY_FEE_SEN).toBeUndefined();
  });

  it("amount guardrails stay $1 minimum", () => {
    expect(MIN_TOPUP_USD).toBe(1);
    expect(MAX_TOPUP_USD).toBe(10_000);
    expect(parseTopUpAmount(0.99)).toBeNull();
    expect(parseTopUpAmount(1)).toBe(1);
    expect(parseTopUpAmount("50")).toBe(50);
    expect(formatUsd(1)).toBe("$1.00");
    expect(QUICK_TOPUP_AMOUNTS).toContain(5);
    expect(formatTokenCount(1_000_000, "ms")).toBe("1,000,000 Token");
  });
});

import { describe, expect, it } from "vitest";
import {
  formatTokenCount,
  getPrice,
  parseTopUpAmount,
  withUsdAmount,
} from "@/lib/pricing";

describe("token pricing", () => {
  it("quotes $1.00 USD in every market", () => {
    for (const region of ["MY", "ID", "OTHER"] as const) {
      const price = getPrice(region);
      expect(price.display).toBe("$1.00");
      expect(price.usdCode).toBe("USD");
      expect(price.usd).toBe(1);
      expect(price.tokens).toBe(1_000_000);
    }
  });

  it("estimates RM4.70 for Malaysia and charges it in ringgit", () => {
    const price = getPrice("MY");
    expect(price.localDisplay).toBe("≈ RM4.70");
    expect(price.currency).toBe("MYR");
    expect(price.amount).toBeCloseTo(4.7, 10);
    expect(price.amountMinor).toBe(470);
  });

  it("estimates Rp16,000 for Indonesia and charges it in rupiah", () => {
    const price = getPrice("ID");
    expect(price.localDisplay).toBe("≈ Rp16,000");
    expect(price.currency).toBe("IDR");
    expect(price.amount).toBe(16_000);
    expect(price.amountMinor).toBe(16_000);
  });

  it("charges USD elsewhere and omits the local estimate", () => {
    const price = getPrice("OTHER");
    expect(price.currency).toBe("USD");
    expect(price.amountMinor).toBe(100);
    expect(price.localDisplay).toBeNull();
  });

  it("scales tokens linearly: $5 buys five million", () => {
    const price = withUsdAmount(getPrice("MY"), 5);
    expect(price.display).toBe("$5.00");
    expect(price.tokens).toBe(5_000_000);
    expect(price.localDisplay).toBe("≈ RM23.50");
    expect(price.amountMinor).toBe(2350);
  });

  it("scales the Indonesian estimate with the amount", () => {
    const price = withUsdAmount(getPrice("ID"), 10);
    expect(price.tokens).toBe(10_000_000);
    expect(price.localDisplay).toBe("≈ Rp160,000");
    expect(price.amountMinor).toBe(160_000);
  });

  it("accepts quick picks and valid custom input", () => {
    expect(parseTopUpAmount(5)).toBe(5);
    expect(parseTopUpAmount("50")).toBe(50);
    expect(parseTopUpAmount("2.5")).toBe(2.5);
  });

  it("rejects anything below the $1 minimum and non-numeric input", () => {
    expect(parseTopUpAmount(0.99)).toBeNull();
    expect(parseTopUpAmount(0)).toBeNull();
    expect(parseTopUpAmount("abc")).toBeNull();
    expect(parseTopUpAmount("")).toBeNull();
    expect(parseTopUpAmount(undefined)).toBeNull();
    expect(parseTopUpAmount(Number.NaN)).toBeNull();
  });

  it("formats the live token preview with grouping", () => {
    expect(formatTokenCount(5_000_000, "en")).toBe("5,000,000 Tokens");
    expect(formatTokenCount(1_000_000, "ms")).toBe("1,000,000 Token");
    expect(formatTokenCount(50_000_000, "id")).toBe("50,000,000 Token");
  });

  it("keeps the token label locale-specific", () => {
    expect(getPrice("MY").tokensLabel.en).toBe("1 Million Tokens");
    expect(getPrice("MY").tokensLabel.ms).toBe("1 Juta Token");
    expect(getPrice("MY").tokensLabel.id).toBe("1 Juta Token");
  });
});

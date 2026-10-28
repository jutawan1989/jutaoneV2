import { describe, expect, it } from "vitest";
import {
  formatTokenCount,
  getPrice,
  parseTopUpAmount,
  withUsdAmount,
} from "@/lib/pricing";

describe("token pricing", () => {
  it("quotes RM4.70 base in every market", () => {
    for (const region of ["MY", "ID", "OTHER"] as const) {
      const price = getPrice(region);
      expect(price.display).toBe("RM4.70");
      expect(price.baseCode).toBe("MYR");
      expect(price.usd).toBe(1);
      expect(price.tokens).toBe(1_000_000);
    }
  });

  it("shows no secondary estimate in Malaysia and charges ringgit", () => {
    const price = getPrice("MY");
    expect(price.localDisplay).toBeNull();
    expect(price.currency).toBe("MYR");
    expect(price.amount).toBeCloseTo(4.7, 10);
    expect(price.amountMinor).toBe(470);
  });

  it("shows the Rupiah estimate for Indonesia and charges rupiah", () => {
    const price = getPrice("ID");
    expect(price.localDisplay).toBe("≈ Rp17,900");
    expect(price.currency).toBe("IDR");
    expect(price.amount).toBe(17_900);
    expect(price.amountMinor).toBe(1_790_000);
  });

  it("shows the Rp17,900 Rupiah estimate for Bahasa Indonesia readers outside Indonesia", () => {
    expect(getPrice("MY", "id").localDisplay).toBe("≈ Rp17,900");
    expect(getPrice("OTHER", "id").localDisplay).toBe("≈ Rp17,900");
    expect(getPrice("MY", "ms").localDisplay).toBeNull();
    expect(getPrice("MY", "en").localDisplay).toBeNull();
  });

  it("charges USD elsewhere and shows the USD equivalent under the RM headline", () => {
    const price = getPrice("OTHER");
    expect(price.currency).toBe("USD");
    expect(price.amountMinor).toBe(100);
    expect(price.localDisplay).toBe("≈ $1.00");
  });

  it("quotes the Rp17,900 static IDR anchor with the RM4.70 headline", () => {
    // CMO/Linda margin spec: USD 1 = RM4.70 = Rp17,900 (static display anchor).
    const price = getPrice("ID");
    expect(price.localDisplay).toBe("≈ Rp17,900");
    expect(price.currency).toBe("IDR");
    expect(price.amount).toBe(17_900);
    expect(price.amountMinor).toBe(1_790_000);
  });

  it("scales tokens linearly: $5 buys five million", () => {
    const price = withUsdAmount(getPrice("MY"), 5);
    expect(price.display).toBe("RM23.50");
    expect(price.tokens).toBe(5_000_000);
    expect(price.localDisplay).toBeNull();
    expect(price.amountMinor).toBe(2350);
  });

  it("scales the Indonesian estimate with the amount", () => {
    const price = withUsdAmount(getPrice("ID"), 10);
    expect(price.display).toBe("RM47.00");
    expect(price.tokens).toBe(10_000_000);
    expect(price.localDisplay).toBe("≈ Rp179,000");
    expect(price.amountMinor).toBe(17_900_000);
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

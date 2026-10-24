import { describe, expect, it } from "vitest";
import { getPrice } from "@/lib/pricing";

describe("token pricing", () => {
  it("prices Malaysia in ringgit", () => {
    const price = getPrice("MY");
    expect(price.currency).toBe("MYR");
    expect(price.display).toBe("RM3");
    expect(price.amountMinor).toBe(300);
  });

  it("prices Indonesia in rupiah", () => {
    const price = getPrice("ID");
    expect(price.currency).toBe("IDR");
    expect(price.display).toBe("Rp10,000");
    expect(price.amountMinor).toBe(10_000);
  });

  it("never quotes USD for visitors outside MY/ID", () => {
    const price = getPrice("OTHER");
    expect(price.currency).toBe("MYR");
    expect(price.display).toBe("RM3");
  });

  it("grants one million tokens per top-up in every region", () => {
    for (const region of ["MY", "ID", "OTHER"] as const) {
      expect(getPrice(region).tokens).toBe(1_000_000);
    }
  });

  it("keeps the base price in English mode (locale-independent)", () => {
    expect(getPrice("MY").tokensLabel.en).toBe("1 Million Tokens");
    expect(getPrice("MY").display).toBe("RM3");
  });
});

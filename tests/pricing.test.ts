import { afterEach, describe, expect, it } from "vitest";
import { BASE_PRICE_USD_CENTS, fxFromEnv, getPrice, type FxRates } from "@/lib/pricing";

const BRIEF_RATES: FxRates = { MYR: 4.7, IDR: 16_000, source: "db" };

describe("token pricing (USD base)", () => {
  afterEach(() => {
    delete process.env.USD_TO_MYR_RATE;
    delete process.env.USD_TO_IDR_RATE;
  });

  it("quotes one US dollar as the base price", () => {
    expect(BASE_PRICE_USD_CENTS).toBe(100);
    expect(getPrice("MY", BRIEF_RATES).baseDisplay).toBe("$1.00");
  });

  it("converts to ringgit at the stored rate", () => {
    const price = getPrice("MY", BRIEF_RATES);
    expect(price.currency).toBe("MYR");
    // 1 USD * 4.70 = RM4.70 = 470 sen
    expect(price.amountMinor).toBe(470);
    expect(price.display).toBe("RM4.70");
    expect(price.fxRate).toBe(4.7);
  });

  it("converts to rupiah at the stored rate", () => {
    const price = getPrice("ID", BRIEF_RATES);
    expect(price.currency).toBe("IDR");
    // 1 USD * 16000 = Rp16,000, held in the same 2-decimal minor unit Chip uses.
    // Verified at the gateway: 1600000 minor units renders "Rp16,000.00",
    // while 16000 renders "Rp160.00" (a 100x undercharge).
    expect(price.amountMinor).toBe(1_600_000);
    expect(price.display).toBe("Rp16.000");
  });

  it("charges visitors outside MY/ID in ringgit, not USD", () => {
    const price = getPrice("OTHER", BRIEF_RATES);
    expect(price.currency).toBe("MYR");
    expect(price.display).toBe("RM4.70");
  });

  it("grants one million tokens per top-up in every region", () => {
    for (const region of ["MY", "ID", "OTHER"] as const) {
      expect(getPrice(region, BRIEF_RATES).tokens).toBe(1_000_000);
    }
  });

  it("keeps the base price separate from the local charge", () => {
    const price = getPrice("ID", BRIEF_RATES);
    expect(price.baseUsdCents).toBe(100);
    // The local amount is what the card is charged; the base is what is booked.
    expect(price.amountMinor).toBe(1_600_000);
  });

  it("rounds a fractional rupiah to a whole minor unit", () => {
    // 1 USD * 15,432.7 would be Rp15.432,70 — not a chargeable amount.
    const price = getPrice("ID", { MYR: 4.7, IDR: 15_432.7, source: "db" });
    expect(Number.isInteger(price.amountMinor)).toBe(true);
    expect(price.amountMinor).toBe(1_543_270);
  });

  it("scales the IDR amount the way the gateway does", () => {
    // Guard against the 100x regression: whole rupiah in, minor units out.
    const price = getPrice("ID", BRIEF_RATES);
    expect(price.amountMinor).toBe(price.amount * 100);
    expect(price.amount).toBe(16_000);
  });

  it("drops trailing zeros on a whole ringgit amount", () => {
    const price = getPrice("MY", { MYR: 3, IDR: 16_000, source: "db" });
    expect(price.display).toBe("RM3");
    expect(price.amountMinor).toBe(300);
  });

  it("falls back to env rates when no database rates are supplied", () => {
    process.env.USD_TO_MYR_RATE = "4.85";
    process.env.USD_TO_IDR_RATE = "16500";
    const rates = fxFromEnv();
    expect(rates).toEqual({ MYR: 4.85, IDR: 16_500, source: "env" });

    const price = getPrice("MY", rates);
    expect(price.amountMinor).toBe(485);
    expect(price.fxSource).toBe("env");
  });

  it("ignores a non-positive env rate instead of charging nothing", () => {
    process.env.USD_TO_MYR_RATE = "0";
    process.env.USD_TO_IDR_RATE = "-5";
    const rates = fxFromEnv();
    expect(rates.MYR).toBeGreaterThan(0);
    expect(rates.IDR).toBeGreaterThan(0);
    expect(rates.source).toBe("default");
  });
});

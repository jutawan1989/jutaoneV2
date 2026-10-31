import { describe, expect, it } from "vitest";
import {
  calculateSavings,
  defaultSavingsCurrency,
  formatSavingsMoney,
  JUTAONE_FLAT_USD_PER_MONTH,
  JUTAONE_MINUTES_PER_AD,
  TOKENS_PER_AD,
  WEEKS_PER_MONTH,
  type SavingsCurrency,
} from "@/lib/savings";

describe("savings calculator", () => {
  it("computes monthly savings from weekly volume (10 ads, 30 min, $8/h)", () => {
    const result = calculateSavings({ adsPerWeek: 10, minutesPerAd: 30, hourlyRate: 8, currency: "USD" });
    const round1 = (n: number) => Math.round(n * 10) / 10;
    expect(result.adsPerMonth).toBe(round1(10 * WEEKS_PER_MONTH));
    expect(result.hoursManual).toBe(round1((10 * WEEKS_PER_MONTH * 30) / 60));
    expect(result.hoursWithJutaOne).toBe(round1((10 * WEEKS_PER_MONTH * JUTAONE_MINUTES_PER_AD) / 60));
    // 43.3 ads x 28 saved minutes = ~20.2h x $8 = ~$161.78
    expect(result.hoursSaved).toBeGreaterThan(19);
    expect(result.moneySavedUsd).toBeCloseTo(result.hoursSaved * 8, 2);
    expect(result.moneySaved).toBe(result.moneySavedUsd);
    expect(result.tokensPerMonth).toBe(Math.round(10 * WEEKS_PER_MONTH * TOKENS_PER_AD));
    expect(result.roiMultiple).toBe(Math.round(result.moneySavedUsd / JUTAONE_FLAT_USD_PER_MONTH));
  });

  it("converts the same time value across USD/MYR/IDR", () => {
    const usd = calculateSavings({ adsPerWeek: 10, minutesPerAd: 30, hourlyRate: 8, currency: "USD" });
    const myr = calculateSavings({ adsPerWeek: 10, minutesPerAd: 30, hourlyRate: 8 * 4.7, currency: "MYR" });
    const idr = calculateSavings({
      adsPerWeek: 10,
      minutesPerAd: 30,
      hourlyRate: 8 * 17_900,
      currency: "IDR",
    });
    expect(myr.hoursSaved).toBe(usd.hoursSaved);
    expect(idr.hoursSaved).toBe(usd.hoursSaved);
    expect(myr.moneySavedUsd).toBeCloseTo(usd.moneySavedUsd, 2);
    expect(idr.moneySavedUsd).toBeCloseTo(usd.moneySavedUsd, 2);
    expect(myr.moneySaved).toBeCloseTo(usd.moneySavedUsd * 4.7, 2);
    expect(Number.isInteger(idr.moneySaved)).toBe(true);
  });

  it("clamps absurd inputs instead of exploding", () => {
    const low = calculateSavings({ adsPerWeek: 0, minutesPerAd: 0, hourlyRate: NaN, currency: "USD" });
    expect(low.adsPerMonth).toBe(Math.round(1 * WEEKS_PER_MONTH * 10) / 10);
    expect(low.moneySaved).toBe(0);
    const high = calculateSavings({ adsPerWeek: 9999, minutesPerAd: 9999, hourlyRate: 1e15, currency: "USD" });
    expect(high.adsPerMonth).toBe(Math.round(100 * WEEKS_PER_MONTH * 10) / 10);
    expect(Number.isFinite(high.moneySaved)).toBe(true);
  });

  it("falls back to USD on an unknown currency", () => {
    const result = calculateSavings({
      adsPerWeek: 5,
      minutesPerAd: 20,
      hourlyRate: 10,
      currency: "EUR" as SavingsCurrency,
    });
    expect(result.currency).toBe("USD");
  });

  it("formats money per currency", () => {
    expect(formatSavingsMoney(1234.5, "USD")).toBe("$1,234.50");
    expect(formatSavingsMoney(1234.5, "MYR")).toBe("RM1,234.50");
    expect(formatSavingsMoney(1234567.8, "IDR")).toBe("Rp1,234,568");
  });

  it("picks the default currency from the page locale", () => {
    expect(defaultSavingsCurrency("ms")).toBe("MYR");
    expect(defaultSavingsCurrency("id")).toBe("IDR");
    expect(defaultSavingsCurrency("en")).toBe("USD");
  });
});

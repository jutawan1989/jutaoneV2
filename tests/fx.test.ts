import { afterEach, describe, expect, it, vi } from "vitest";
import { __clearFxCache, getExchangeRate, roundIdr } from "@/lib/fx";
import { classifyPurchase } from "@/lib/payment/purchase-kind";
import { priceForCheckout } from "@/lib/pricing";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("RM-anchored FX (Boss spec)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FX_RM_TO_IDR;
    delete process.env.FX_RM_TO_USD;
    __clearFxCache();
  });

  it("prefers the static .env rate over the live feed", async () => {
    process.env.FX_RM_TO_IDR = "3600";
    const fetchMock = vi.fn(async () => {
      throw new Error("feed must not be called when env is set");
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await getExchangeRate("IDR")).toBe(3600);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the free live feed when no env override is set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ result: "success", rates: { IDR: 3550.5, USD: 0.21 } })),
    );
    expect(await getExchangeRate("IDR")).toBe(3550.5);
    expect(await getExchangeRate("USD")).toBe(0.21);
  });

  it("falls back to built-ins when the feed fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ result: "error" }, 500)),
    );
    expect(await getExchangeRate("IDR")).toBe(3_600);
  });

  it("rounds rupiah to cantik numbers", () => {
    expect(roundIdr(16_020)).toBe(16_000);
    expect(roundIdr(16_300)).toBe(16_500);
    expect(roundIdr(160_400)).toBe(160_000);
    expect(roundIdr(0)).toBe(500);
  });

  it("checkout derives IDR from the RM base and rounds cantik", async () => {
    process.env.FX_RM_TO_IDR = "3600";
    const price = await priceForCheckout("IDR", 1, "id");
    // RM base 4.70 x 3600 = 16,920 -> rounded to 17,000.
    expect(price.rmBase).toBeCloseTo(4.7, 10);
    expect(price.amount).toBe(17_000);
    expect(price.localDisplay).toBe("≈ Rp17,000");
    expect(price.display).toBe("RM4.70");
    expect(price.fxRate).toBe(3600);
  });

  it("checkout passes non-IDR currencies through unchanged", async () => {
    const price = await priceForCheckout("MYR", 5, "ms");
    expect(price.rmBase).toBeNull();
    expect(price.amountMinor).toBe(2350);
  });

  it("parses rm/fx markers from Chip notes for the Supabase record", () => {
    const owner = "a".repeat(64);
    const parsed = classifyPurchase(`variant=x;region=ID;owner=${owner};usd=100;rm=470;fx=3600`);
    expect(parsed.rmCents).toBe(470);
    expect(parsed.fxRate).toBe(3600);
    expect(parsed.usdCents).toBe(100);
  });

  it("leaves rm/fx null when the notes carry no markers", () => {
    const parsed = classifyPurchase("variant=x;region=MY");
    expect(parsed.rmCents).toBeNull();
    expect(parsed.fxRate).toBeNull();
  });
});

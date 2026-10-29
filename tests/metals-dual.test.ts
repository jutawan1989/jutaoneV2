import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __clearGoldpriceMemoryCache,
  getPublicMetalPrices,
  goldpriceConfigured,
  publicCurrencyForLocale,
  publicCurrencyForRegion,
} from "@/lib/goldprice";
import {
  getPremiumMetalAnalysis,
  metalCurrencyForRegion,
  metalsConfigured,
  signalFromRange,
} from "@/lib/metals";
import { METALS_COST_TOKENS } from "@/lib/tokens";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Dual metals API (homepage free, dashboard premium)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOLDPRICE_API_KEY;
    delete process.env.RAPIDAPI_KEY;
    __clearGoldpriceMemoryCache();
  });

  it("costs 2,000 tokens per premium analysis", () => {
    expect(METALS_COST_TOKENS).toBe(2_000);
  });

  it("maps regions to display currency (MY -> MYR, ID -> IDR, OTHER -> MYR)", () => {
    expect(publicCurrencyForRegion("MY")).toBe("MYR");
    expect(publicCurrencyForRegion("ID")).toBe("IDR");
    expect(publicCurrencyForRegion("OTHER")).toBe("MYR");
    expect(metalCurrencyForRegion("ID")).toBe("IDR");
    expect(metalCurrencyForRegion("MY")).toBe("MYR");
  });

  it("maps locales to widget currency (ms -> MYR, id -> IDR, en -> USD)", () => {
    expect(publicCurrencyForLocale("ms")).toBe("MYR");
    expect(publicCurrencyForLocale("id")).toBe("IDR");
    expect(publicCurrencyForLocale("en")).toBe("USD");
    expect(publicCurrencyForLocale("xx")).toBe("MYR");
  });

  it("free feed is unconfigured without GOLDPRICE_API_KEY", () => {
    expect(goldpriceConfigured()).toBe(false);
    process.env.GOLDPRICE_API_KEY = "k";
    expect(goldpriceConfigured()).toBe(true);
  });

  it("premium feed is unconfigured without RAPIDAPI_KEY", () => {
    expect(metalsConfigured()).toBe(false);
    process.env.RAPIDAPI_KEY = "k";
    expect(metalsConfigured()).toBe(true);
  });

  it("free feed converts USD to MYR with the Boss fixed rate (x4.70)", async () => {
    process.env.GOLDPRICE_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          symbols: [
            { symbol: "XAU", quote_currency: "USD", price: "4000.00", is_stale: false },
            { symbol: "XAG", quote_currency: "USD", price: "50.00", is_stale: false },
          ],
        }),
      ),
    );

    const prices = await getPublicMetalPrices("MYR");
    expect(prices?.currency).toBe("MYR");
    expect(prices?.source).toBe("live");
    expect(prices?.gold).toBe(18_800);
    expect(prices?.silver).toBe(235);
    // Tri-quote: same spot in all three as clean floats for Intl.NumberFormat.
    expect(prices?.usd).toEqual({ gold: 4000, silver: 50 });
    expect(prices?.myr).toEqual({ gold: 18_800, silver: 235 });
    expect(prices?.idr).toEqual({ gold: 64_000_000, silver: 800_000 });
  });

  it("free feed returns raw USD spot for the en locale", async () => {
    process.env.GOLDPRICE_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          symbols: [
            { symbol: "XAU", quote_currency: "USD", price: "4000.00", is_stale: false },
            { symbol: "XAG", quote_currency: "USD", price: "50.00", is_stale: false },
          ],
        }),
      ),
    );

    const prices = await getPublicMetalPrices("USD");
    expect(prices?.currency).toBe("USD");
    expect(prices?.gold).toBe(4000);
    expect(prices?.silver).toBe(50);
    expect(prices?.usd).toEqual({ gold: 4000, silver: 50 });
    expect(prices?.myr).toEqual({ gold: 18_800, silver: 235 });
    expect(prices?.idr).toEqual({ gold: 64_000_000, silver: 800_000 });
  });

  it("free feed converts USD to IDR with the Boss fixed rate (x16000)", async () => {
    process.env.GOLDPRICE_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          symbols: [
            { symbol: "XAU", quote_currency: "USD", price: "4000.00" },
            { symbol: "XAG", quote_currency: "USD", price: "50.00" },
          ],
        }),
      ),
    );

    const prices = await getPublicMetalPrices("IDR");
    expect(prices?.gold).toBe(64_000_000);
    expect(prices?.silver).toBe(800_000);
  });

  it("free feed serves the 4h cache instead of calling the vendor twice", async () => {
    process.env.GOLDPRICE_API_KEY = "test-key";
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        symbols: [
          { symbol: "XAU", price: "4000.00" },
          { symbol: "XAG", price: "50.00" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await getPublicMetalPrices("MYR");
    const second = await getPublicMetalPrices("MYR");
    expect(first?.source).toBe("live");
    expect(second?.source).toBe("cache");
    expect(second?.gold).toBe(first?.gold);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("free feed backfills gold when the combined response omits XAU (keyless tier)", async () => {
    delete process.env.GOLDPRICE_API_KEY;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        // Exact production reproduction: combined call returns XAG only.
        if (u.includes("symbol=XAU-USD-SPOT&symbol=XAG-USD-SPOT")) {
          return jsonResponse({ symbols: [{ symbol: "XAG", quote_currency: "USD", price: "50.00" }] });
        }
        // Single-symbol backfill returns the missing gold row.
        if (u.includes("symbol=XAU-USD-SPOT")) {
          return jsonResponse({ symbols: [{ symbol: "XAU", quote_currency: "USD", price: "4000.00" }] });
        }
        return jsonResponse({ symbols: [] });
      }),
    );

    const prices = await getPublicMetalPrices("MYR");
    expect(prices?.gold).toBe(18_800);
    expect(prices?.silver).toBe(235);
  });

  it("free feed falls back to gold-api.com when goldprice.dev has no gold row", async () => {
    delete process.env.GOLDPRICE_API_KEY;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("api.gold-api.com/price/XAU")) {
          return jsonResponse({ price: 4000.5, currency: "USD", symbol: "XAU" });
        }
        if (u.includes("api.gold-api.com/price/XAG")) {
          return jsonResponse({ price: 50.25, currency: "USD", symbol: "XAG" });
        }
        // goldprice.dev returns nothing usable at all.
        return jsonResponse({ symbols: [] });
      }),
    );

    const prices = await getPublicMetalPrices("MYR");
    expect(prices?.gold).toBe(18_802.35);
    expect(prices?.silver).toBe(236.18);
  });

  it("premium analysis returns karat/fineness breakdowns plus trend", async () => {
    process.env.RAPIDAPI_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/gold-price")) {
          return jsonResponse({
            results: [
              {
                symbol: "AU",
                currency: "MYR",
                ask: 19001,
                mid: 19000,
                bid: 18999,
                high: 19100,
                low: 18900,
                timestamp: 1793101620,
                change: 120,
                changePercentage: 0.63,
                karat_prices: { "24k": 19000, "18k": 14250, "14k": 11083, "9k": 7125 },
              },
            ],
          });
        }
        return jsonResponse({
          results: [
            {
              symbol: "AG",
              currency: "MYR",
              mid: 250,
              change: -2,
              changePercentage: -0.8,
              fineness_prices: { "999": 250, "958": 239, "925": 231, "900": 225, "800": 200 },
            },
          ],
        });
      }),
    );

    const analysis = await getPremiumMetalAnalysis("MYR");
    expect(analysis.gold?.karatPrices?.["24k"]).toBe(19000);
    expect(analysis.gold?.trend).toBe("up");
    expect(analysis.silver?.finenessPrices?.["999"]).toBe(250);
    expect(analysis.silver?.trend).toBe("down");
  });

  it("premium analysis throws without a key (route maps to 503, never charges)", async () => {
    await expect(getPremiumMetalAnalysis("MYR")).rejects.toThrow(/RAPIDAPI_KEY/);
  });

  it("premium analysis carries the position signal Ali needs (ai_signal + reason)", async () => {
    process.env.RAPIDAPI_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/gold-price")) {
          return jsonResponse({
            results: [
              {
                symbol: "AU",
                currency: "MYR",
                ask: 19001,
                mid: 19000,
                bid: 18999,
                high: 19100,
                low: 18900,
                timestamp: 1793101620,
                change: 120,
                changePercentage: 0.63,
                karat_prices: { "24k": 19000, "18k": 14250, "14k": 11083, "9k": 7125 },
              },
            ],
          });
        }
        return jsonResponse({
          results: [
            {
              symbol: "AG",
              currency: "MYR",
              mid: 250,
              high: 285,
              low: 245,
              change: -2,
              changePercentage: -0.8,
              fineness_prices: { "999": 250, "958": 239, "925": 231, "900": 225, "800": 200 },
            },
          ],
        });
      }),
    );

    const analysis = await getPremiumMetalAnalysis("MYR");
    // Gold mid 19000 sits mid-range (18900-19100): SIMPAN.
    expect(analysis.gold?.ai_signal).toBe("SIMPAN");
    expect(analysis.gold?.signal_reason).toContain("pertengahan");
    // Silver mid 250 sits 12.5% up its range (245-285): bottom 15% -> BELI.
    expect(analysis.silver?.ai_signal).toBe("BELI");
    expect(analysis.silver?.signal_reason).toContain("sokongan terendah");
  });

  it("signal reads range position: near-low BELI, near-high JUAL, mid SIMPAN", () => {
    expect(signalFromRange(100, 90, 190).ai_signal).toBe("BELI"); // 10% up the range
    expect(signalFromRange(185, 90, 190).ai_signal).toBe("JUAL"); // 95% up the range
    expect(signalFromRange(140, 90, 190).ai_signal).toBe("SIMPAN");
    expect(signalFromRange(100, 90, 190).signal_reason).toContain("sokongan terendah");
    expect(signalFromRange(185, 90, 190).signal_reason).toContain("rintangan tertinggi");
  });

  it("signal degrades to SIMPAN when the day range is missing", () => {
    expect(signalFromRange(100, null, 190).ai_signal).toBe("SIMPAN");
    expect(signalFromRange(null, 90, 190).ai_signal).toBe("SIMPAN");
    expect(signalFromRange(100, 190, 190).ai_signal).toBe("SIMPAN"); // degenerate range
  });
});

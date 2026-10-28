import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROVIDER_ORDER,
  normalizeSerperResults,
  primaryProvider,
  runProvider,
  searchSuppliers,
  serperConfigured,
} from "@/lib/search";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ENV_KEYS = ["SEARCH_PROVIDER", "SERPER_API_KEY", "EXA_API_KEY", "TAVILY_API_KEY"] as const;

describe("Serper layer (layer 3)", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("is unconfigured without a key", () => {
    expect(serperConfigured()).toBe(false);
    process.env.SERPER_API_KEY = "test-key";
    expect(serperConfigured()).toBe(true);
  });

  it("uses exa as the default primary", () => {
    expect(primaryProvider()).toBe("exa");
    expect(PROVIDER_ORDER).toEqual(["exa", "tavily", "serper"]);
  });

  it("honours SEARCH_PROVIDER=serper", () => {
    process.env.SEARCH_PROVIDER = "serper";
    expect(primaryProvider()).toBe("serper");
  });

  it("normalises Google organic results to supplier cards", () => {
    const results = normalizeSerperResults({
      organic: [
        { title: "Zaine Textile | Pemborong Kain Kelantan", link: "https://zaine.com.my/kain", snippet: "  Pemborong kain  borong " },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0].companyName).toBe("Zaine Textile");
    expect(results[0].url).toBe("https://zaine.com.my/kain");
    expect(results[0].description).toBe("Pemborong kain borong");
    expect(results[0].verified).toBe(false);
  });

  it("dedupes repeated links and skips rows without a link", () => {
    const results = normalizeSerperResults({
      organic: [
        { title: "Kedai A", link: "https://kedai.my/a", snippet: "satu" },
        { title: "Kedai A (mirror)", link: "https://kedai.my/a", snippet: "dua" },
        { title: "Tanpa pautan", snippet: "tiada link" },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0].companyName).toBe("Kedai A");
  });

  it("pins gl/hl to the country (MY -> gl=my/hl=ms, ID -> gl=id/hl=id)", async () => {
    process.env.SERPER_API_KEY = "test-key";
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
        return jsonResponse({ organic: [] });
      }),
    );

    await runProvider("serper", "pembekal kain", "MY");
    await runProvider("serper", "supplier kopi", "ID");

    expect(calls[0]?.url).toBe("https://google.serper.dev/search");
    expect(calls[0]?.body).toMatchObject({ q: "pembekal kain", num: 10, gl: "my", hl: "ms" });
    expect(calls[1]?.body).toMatchObject({ gl: "id", hl: "id" });
  });

  it("reports unconfigured instead of calling Serper without a key", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ organic: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await runProvider("serper", "pembekal kain", "MY");
    expect(outcome.ok).toBe(false);
    expect(outcome.unconfigured).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flags a rejected key without marking it unconfigured", async () => {
    process.env.SERPER_API_KEY = "bad-key";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ message: "unauthorized" }, 401)));
    const outcome = await runProvider("serper", "pembekal kain", "MY");
    expect(outcome.ok).toBe(false);
    expect(outcome.unconfigured).toBe(false);
    expect(outcome.error).toMatch(/401\/403/);
  });

  it("tries Exa -> Tavily -> Serper in order when the earlier layers fail", async () => {
    process.env.SERPER_API_KEY = "test-key";
    delete process.env.EXA_API_KEY;
    delete process.env.TAVILY_API_KEY;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          organic: [{ title: "Pemborong ABC", link: "https://abc.com.my/", snippet: "borong" }],
        }),
      ),
    );

    const { outcome, attempts } = await searchSuppliers("pembekal kain", "MY");
    expect(attempts.map((a) => a.provider)).toEqual(["exa", "tavily", "serper"]);
    expect(outcome.provider).toBe("serper");
    expect(outcome.ok).toBe(true);
    expect(outcome.results).toHaveLength(1);
  });
});

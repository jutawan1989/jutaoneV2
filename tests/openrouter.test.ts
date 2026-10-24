import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateCaption } from "@/lib/ai";
import { generateWithOpenRouter, openRouterConfigured } from "@/lib/ai/openrouter";

const REQUEST = { text: "Kek lapis Sarawak, RM45 sekotak", locale: "ms", region: "MY" } as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenRouter adapter", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    delete process.env.OPENROUTER_ENABLED;
    delete process.env.OPENROUTER_MAX_TOKENS;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_ENABLED;
    delete process.env.OPENROUTER_MAX_TOKENS;
    delete process.env.META_AI_API_KEY;
  });

  it("is switchable off without removing the key", () => {
    expect(openRouterConfigured()).toBe(true);
    process.env.OPENROUTER_ENABLED = "0";
    expect(openRouterConfigured()).toBe(false);
  });

  it("asks for a token budget large enough for the mandatory reasoning pass", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        jsonResponse({ choices: [{ message: { content: "ok" } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await generateWithOpenRouter(REQUEST);

    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body ?? "{}"));
    // Under ~1500 the free model spends the whole budget reasoning and returns
    // content: null, which is the failure this budget guards against.
    expect(body.max_tokens).toBeGreaterThanOrEqual(1500);
  });

  it("returns the caption and the reported spend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          choices: [{ finish_reason: "stop", message: { content: "  \"Kek lapis RM45!\"  " } }],
          usage: { total_tokens: 900, cost: 0.00042 },
        }),
      ),
    );

    const result = await generateWithOpenRouter(REQUEST);
    expect(result.source).toBe("openrouter");
    expect(result.caption).toBe("Kek lapis RM45!");
    expect(result.costUsd).toBeCloseTo(0.00042);
  });

  it("explains a reasoning-only response instead of reporting an empty caption", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          choices: [
            { finish_reason: "length", message: { content: null, reasoning: "thinking..." } },
          ],
          usage: { completion_tokens_details: { reasoning_tokens: 2000 } },
        }),
      ),
    );

    await expect(generateWithOpenRouter(REQUEST)).rejects.toThrow(/reasoning_tokens=2000/);
  });

  it("surfaces the HTTP status when the provider rejects the call", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 429 })));
    await expect(generateWithOpenRouter(REQUEST)).rejects.toThrow(/429/);
  });
});

describe("provider chain", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    delete process.env.META_AI_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.META_AI_API_KEY;
    delete process.env.OPENROUTER_ENABLED;
    vi.restoreAllMocks();
  });

  it("uses the real provider when it answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ choices: [{ finish_reason: "stop", message: { content: "Kapsyen sebenar" } }] }),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await generateCaption({ ...REQUEST });
    expect(result.source).toBe("openrouter");
    expect(result.caption).toBe("Kapsyen sebenar");
  });

  it("falls back to the local template when every provider fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await generateCaption({ ...REQUEST });
    expect(result.source).toBe("mock-fallback");
    expect(result.caption.length).toBeGreaterThan(20);
    expect(result.costUsd).toBe(0);
  });
});

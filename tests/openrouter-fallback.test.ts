import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FREE_MODELS,
  MAX_FALLBACK_MODELS,
  assertFreeModels,
  generateWithOpenRouter,
  openRouterModels,
} from "@/lib/ai/openrouter";

const REQUEST = { text: "Kek lapis Sarawak, RM45 sekotak", locale: "ms", region: "MY" } as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type FetchMock = ReturnType<typeof vi.fn>;
type FetchArgs = [url: string, init?: RequestInit];

function stubFetch(responses: Array<() => Response>): FetchMock {
  const mock = vi.fn<(...args: FetchArgs) => Promise<Response>>(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra fetch call");
    return next();
  });
  vi.stubGlobal("fetch", mock);
  return mock as unknown as FetchMock;
}

function bodyOf(mock: FetchMock, index: number): Record<string, unknown> {
  return JSON.parse(String(mock.mock.calls[index]?.[1]?.body ?? "{}"));
}

describe("free model array", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    delete process.env.OPENROUTER_MODELS;
    delete process.env.OPENROUTER_MODEL;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODELS;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_REASONING;
  });

  it("sends at most the three models the API accepts", () => {
    // Measured: a fourth entry returns 400 "'models' array must have 3 items or
    // fewer", which would break working configurations.
    expect(MAX_FALLBACK_MODELS).toBe(3);
    expect(DEFAULT_FREE_MODELS.length).toBeLessThanOrEqual(MAX_FALLBACK_MODELS);
    expect(DEFAULT_FREE_MODELS.length).toBeGreaterThanOrEqual(3);
  });

  it("truncates an over-long OPENROUTER_MODELS instead of failing the request", () => {
    process.env.OPENROUTER_MODELS = [
      "dots-studio/dots-3-note-preview:free",
      "nvidia/nemotron-3.5-lightning:free",
      "google/gemma-4-26b-a4b-it:free",
      "xingchen-agi/xing4.0-29b-a4b:free",
    ].join(",");
    expect(openRouterModels()).toHaveLength(MAX_FALLBACK_MODELS);
    expect(openRouterModels()[0]).toBe("dots-studio/dots-3-note-preview:free");
  });

  it("every default model is free", () => {
    for (const model of DEFAULT_FREE_MODELS) {
      expect(model.endsWith(":free") || model === "openrouter/free").toBe(true);
    }
  });

  it("sends the array, not a single model", async () => {
    const fetchMock = stubFetch([
      () =>
        jsonResponse({
          model: "nvidia/nemotron-3.5-lightning:free",
          choices: [{ finish_reason: "stop", message: { content: "ok" } }],
        }),
    ]);

    await generateWithOpenRouter(REQUEST);
    const body = bodyOf(fetchMock, 0);
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models).toEqual([...DEFAULT_FREE_MODELS]);
    expect(body).not.toHaveProperty("model");
  });

  it("reports which model actually answered", async () => {
    stubFetch([
      () =>
        jsonResponse({
          // OpenRouter fell through to the third entry.
          model: "google/gemma-4-26b-a4b-it:free",
          choices: [{ finish_reason: "stop", message: { content: "Kapsyen" } }],
        }),
    ]);

    const result = await generateWithOpenRouter(REQUEST);
    expect(result.model).toBe("google/gemma-4-26b-a4b-it:free");
    expect(result.caption).toBe("Kapsyen");
  });

  it("reads the list from OPENROUTER_MODELS", () => {
    process.env.OPENROUTER_MODELS =
      "dots-studio/dots-3-note-preview:free, google/gemma-4-26b-a4b-it:free";
    expect(openRouterModels()).toEqual([
      "dots-studio/dots-3-note-preview:free",
      "google/gemma-4-26b-a4b-it:free",
    ]);
  });

  it("still accepts the legacy single OPENROUTER_MODEL", () => {
    process.env.OPENROUTER_MODEL = "dots-studio/dots-3-note-preview:free";
    expect(openRouterModels()).toEqual(["dots-studio/dots-3-note-preview:free"]);
  });
});

describe("never billed", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODELS;
  });

  it("rejects a paid model outright", () => {
    expect(() => assertFreeModels(["openai/gpt-4o"])).toThrow(/not the free tier/);
    expect(() => assertFreeModels(["anthropic/claude-sonnet-4"])).toThrow(/not the free tier/);
  });

  it("rejects a list where only some entries are free", () => {
    expect(() =>
      assertFreeModels(["dots-studio/dots-3-note-preview:free", "openai/gpt-4o"]),
    ).toThrow(/openai\/gpt-4o/);
  });

  it("refuses to call the API at all when a paid model is configured", async () => {
    process.env.OPENROUTER_MODELS = "openai/gpt-4o";
    const fetchMock = stubFetch([]);

    await expect(generateWithOpenRouter(REQUEST)).rejects.toThrow(/not the free tier/);
    // The request never left the process, so no charge could be incurred.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts an all-free list", () => {
    expect(() => assertFreeModels([...DEFAULT_FREE_MODELS])).not.toThrow();
  });

  it("allows the catalogue-verified router model without a :free suffix", () => {
    // openrouter/free reports pricing 0/0 in /models, so rejecting it would
    // throw away a legitimately free model.
    expect(() => assertFreeModels(["openrouter/free"])).not.toThrow();
  });

  it("still rejects an unknown model that merely looks free", () => {
    expect(() => assertFreeModels(["openrouter/not-a-real-model"])).toThrow(/not the free tier/);
    expect(() => assertFreeModels(["meta-llama/llama-3.3-70b-instruct"])).toThrow(
      /not the free tier/,
    );
  });
});

describe("failure reporting", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("names the account-wide daily cap instead of a bare 429", async () => {
    stubFetch([
      () =>
        jsonResponse(
          {
            error: {
              message: "Rate limit exceeded: free-models-per-day",
              code: 429,
              metadata: { limit_source: "openrouter_free_tier_daily" },
            },
          },
          429,
        ),
    ]);

    // The scope matters: adding models cannot fix an account-wide cap.
    await expect(generateWithOpenRouter(REQUEST)).rejects.toThrow(
      /openrouter_free_tier_daily/,
    );
  });

  it("throws only after OpenRouter has exhausted the array", async () => {
    // A single non-ok response means OpenRouter already tried every model.
    const fetchMock = stubFetch([() => new Response("unavailable", { status: 404 })]);
    await expect(generateWithOpenRouter(REQUEST)).rejects.toThrow(/404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

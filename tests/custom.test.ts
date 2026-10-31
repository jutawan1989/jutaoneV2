import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateCaption, providerChain } from "@/lib/ai";
import { customAIConfigured, generateWithCustomAI } from "@/lib/ai/custom";

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
  const init = mock.mock.calls[index]?.[1];
  return JSON.parse(String(init?.body ?? "{}"));
}

const ENV_KEYS = [
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "META_AI_API_KEY",
  "CUSTOM_AI_API_KEY",
  "CUSTOM_AI_ENABLED",
  "CUSTOM_AI_MODEL",
] as const;

describe("Top-Tools-Ai adapter (custom)", () => {
  beforeEach(() => {
    process.env.CUSTOM_AI_API_KEY = "test-key";
    delete process.env.CUSTOM_AI_ENABLED;
    delete process.env.CUSTOM_AI_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("is switchable off without removing the key", () => {
    expect(customAIConfigured()).toBe(true);
    process.env.CUSTOM_AI_ENABLED = "0";
    expect(customAIConfigured()).toBe(false);
  });

  it("posts Top-Tools-Ai to the custom chat completions endpoint", async () => {
    const fetchMock = stubFetch([
      () =>
        jsonResponse({
          choices: [{ message: { content: "Kek lapis sedap! Cuba hari ini." } }],
          usage: { total_tokens: 40 },
        }),
    ]);
    const result = await generateWithCustomAI(REQUEST);
    expect(result.source).toBe("custom");
    expect(result.model).toBe("Top-Tools-Ai");
    expect(result.caption.length).toBeGreaterThan(0);
    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://top-tools-ai.com/api/v1/chat/completions");
    expect(bodyOf(fetchMock, 0).model).toBe("Top-Tools-Ai");
  });

  it("throws a readable error when the key is rejected", async () => {
    stubFetch([() => jsonResponse({ error: { message: "Incorrect API key" } }, 401)]);
    await expect(generateWithCustomAI(REQUEST)).rejects.toThrow(/Top-Tools-Ai responded 401/);
  });

  it("sits third in the chain: groq, openrouter, custom, gemini, openai, meta", () => {
    process.env.GROQ_API_KEY = "k1";
    process.env.OPENROUTER_API_KEY = "k2";
    process.env.CUSTOM_AI_API_KEY = "k3";
    process.env.GEMINI_API_KEY = "k4";
    process.env.OPENAI_API_KEY = "k5";
    process.env.META_AI_API_KEY = "k6";
    expect(providerChain().map((p) => p.name)).toEqual([
      "groq",
      "openrouter",
      "custom",
      "gemini",
      "openai",
      "meta",
    ]);
  });

  it("unused when the key is absent", () => {
    delete process.env.CUSTOM_AI_API_KEY;
    expect(customAIConfigured()).toBe(false);
  });

  it("never includes deepseek, even with a key set", () => {
    process.env.DEEPSEEK_API_KEY = "legacy-key";
    expect(providerChain().map((p) => p.name)).not.toContain("deepseek");
    delete process.env.DEEPSEEK_API_KEY;
  });

  it("falls through to the local template when only custom is set and it fails", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.META_AI_API_KEY;
    stubFetch([() => jsonResponse({ error: { message: "server busy" } }, 500)]);
    const result = await generateCaption(REQUEST);
    expect(result.source).toBe("mock-fallback");
  });
});

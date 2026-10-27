import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateCaption, providerChain } from "@/lib/ai";
import { generateWithOpenAI, openAIConfigured } from "@/lib/ai/openai";

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
  "DEEPSEEK_API_KEY",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_ENABLED",
  "OPENAI_MODEL",
  "OPENROUTER_API_KEY",
  "META_AI_API_KEY",
] as const;

describe("OpenAI adapter (gpt-4o-mini)", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OPENAI_ENABLED;
    delete process.env.OPENAI_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("is switchable off without removing the key", () => {
    expect(openAIConfigured()).toBe(true);
    process.env.OPENAI_ENABLED = "0";
    expect(openAIConfigured()).toBe(false);
  });

  it("posts gpt-4o-mini to the OpenAI chat completions endpoint", async () => {
    const fetchMock = stubFetch([
      () =>
        jsonResponse({
          choices: [{ message: { content: "Kek lapis sedap! Cuba hari ini." } }],
          usage: { total_tokens: 40 },
        }),
    ]);
    const result = await generateWithOpenAI(REQUEST);
    expect(result.source).toBe("openai");
    expect(result.model).toBe("gpt-4o-mini");
    expect(result.caption.length).toBeGreaterThan(0);
    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(bodyOf(fetchMock, 0).model).toBe("gpt-4o-mini");
  });

  it("throws a readable error when the key is rejected", async () => {
    stubFetch([() => jsonResponse({ error: { message: "Incorrect API key" } }, 401)]);
    await expect(generateWithOpenAI(REQUEST)).rejects.toThrow(/OpenAI responded 401/);
  });

  it("sits third in the chain: deepseek, groq, openai, openrouter, meta", () => {
    process.env.DEEPSEEK_API_KEY = "k1";
    process.env.GROQ_API_KEY = "k2";
    process.env.OPENROUTER_API_KEY = "k3";
    process.env.META_AI_API_KEY = "k4";
    expect(providerChain().map((p) => p.name)).toEqual([
      "deepseek",
      "groq",
      "openai",
      "openrouter",
      "meta",
    ]);
  });

  it("falls through to the local template when only OpenAI is set and it fails", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.META_AI_API_KEY;
    stubFetch([() => jsonResponse({ error: { message: "server busy" } }, 500)]);
    const result = await generateCaption(REQUEST);
    expect(result.source).toBe("mock-fallback");
  });
});

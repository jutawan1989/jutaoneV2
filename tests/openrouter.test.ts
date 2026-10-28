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

describe("OpenRouter adapter", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    delete process.env.OPENROUTER_ENABLED;
    delete process.env.OPENROUTER_MAX_TOKENS;
    delete process.env.OPENROUTER_REASONING;
    delete process.env.OPENROUTER_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_ENABLED;
    delete process.env.OPENROUTER_MAX_TOKENS;
    delete process.env.OPENROUTER_REASONING;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.META_AI_API_KEY;
  });

  it("is switchable off without removing the key", () => {
    expect(openRouterConfigured()).toBe(true);
    process.env.OPENROUTER_ENABLED = "0";
    expect(openRouterConfigured()).toBe(false);
  });

  it("disables reasoning so the model answers in seconds, not tens of seconds", async () => {
    const fetchMock = stubFetch([() => jsonResponse({ choices: [{ message: { content: "ok" } }] })]);
    await generateWithOpenRouter(REQUEST);

    const body = bodyOf(fetchMock, 0);
    expect(body.reasoning).toEqual({ enabled: false });
    // A reasoning pass would consume the whole budget and return content: null.
    expect(body.max_tokens).toBeLessThanOrEqual(600);
  });

  it("honours OPENROUTER_REASONING=on by omitting the flag", async () => {
    process.env.OPENROUTER_REASONING = "on";
    const fetchMock = stubFetch([() => jsonResponse({ choices: [{ message: { content: "ok" } }] })]);
    await generateWithOpenRouter(REQUEST);

    expect(bodyOf(fetchMock, 0)).not.toHaveProperty("reasoning");
  });

  it("retries without the flag when the model refuses to disable reasoning", async () => {
    const fetchMock = stubFetch([
      () =>
        jsonResponse(
          { error: { message: "Reasoning is mandatory for this endpoint and cannot be disabled." } },
          400,
        ),
      () => jsonResponse({ choices: [{ finish_reason: "stop", message: { content: "Kapsyen" } }] }),
    ]);

    const result = await generateWithOpenRouter(REQUEST);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock, 0)).toHaveProperty("reasoning");
    expect(bodyOf(fetchMock, 1)).not.toHaveProperty("reasoning");
    expect(result.caption).toBe("Kapsyen");
  });

  it("does not retry an unrelated 400", async () => {
    const fetchMock = stubFetch([() => jsonResponse({ error: { message: "bad model" } }, 400)]);
    await expect(generateWithOpenRouter(REQUEST)).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the caption and the reported spend", async () => {
    stubFetch([
      () =>
        jsonResponse({
          choices: [{ finish_reason: "stop", message: { content: "  \"Kek lapis RM45!\"  " } }],
          usage: { total_tokens: 180, cost: 0 },
        }),
    ]);

    const result = await generateWithOpenRouter(REQUEST);
    expect(result.source).toBe("openrouter");
    expect(result.caption).toBe("Kek lapis RM45!");
    expect(result.costUsd).toBe(0);
  });

  it("explains a reasoning-only response instead of reporting an empty caption", async () => {
    stubFetch([
      () =>
        jsonResponse({
          choices: [
            { finish_reason: "length", message: { content: null, reasoning: "thinking..." } },
          ],
          usage: { completion_tokens_details: { reasoning_tokens: 2000 } },
        }),
    ]);

    await expect(generateWithOpenRouter(REQUEST)).rejects.toThrow(/reasoning_tokens=2000/);
  });

  it("surfaces the HTTP status when the provider rejects the call", async () => {
    stubFetch([() => new Response("nope", { status: 429 })]);
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
    stubFetch([
      () =>
        jsonResponse({ choices: [{ finish_reason: "stop", message: { content: "Kapsyen sebenar" } }] }),
    ]);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await generateCaption({ ...REQUEST });
    expect(result.source).toBe("openrouter");
    expect(result.caption).toContain("Kapsyen sebenar");
    expect(result.caption).toContain("https://jutaone.biz/?utm_source=ai_caption&utm_medium=social");
  });

  it("falls back to the local template when every provider fails", async () => {
    stubFetch([() => new Response("boom", { status: 500 })]);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await generateCaption({ ...REQUEST });
    expect(result.source).toBe("mock-fallback");
    expect(result.caption.length).toBeGreaterThan(20);
    expect(result.costUsd).toBe(0);
  });
});

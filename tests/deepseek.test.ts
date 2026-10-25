import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateCaption } from "@/lib/ai";
import { deepSeekConfigured, generateWithDeepSeek } from "@/lib/ai/deepseek";

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

describe("DeepSeek adapter", () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    delete process.env.DEEPSEEK_ENABLED;
    delete process.env.DEEPSEEK_MODEL;
    delete process.env.DEEPSEEK_BASE_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_ENABLED;
    delete process.env.DEEPSEEK_MODEL;
    delete process.env.DEEPSEEK_BASE_URL;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.META_AI_API_KEY;
    vi.restoreAllMocks();
  });

  it("is switchable off without removing the key", () => {
    expect(deepSeekConfigured()).toBe(true);
    process.env.DEEPSEEK_ENABLED = "0";
    expect(deepSeekConfigured()).toBe(false);
  });

  it("defaults to the non-reasoning model", async () => {
    const fetchMock = stubFetch([
      () => jsonResponse({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] }),
    ]);
    await generateWithDeepSeek(REQUEST);
    // deepseek-reasoner would burn the budget on thinking, the same trap the
    // free OpenRouter reasoning models had.
    expect(bodyOf(fetchMock, 0).model).toBe("deepseek-chat");
  });

  it("calls the platform endpoint, not OpenRouter", async () => {
    const fetchMock = stubFetch([
      () => jsonResponse({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] }),
    ]);
    await generateWithDeepSeek(REQUEST);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.deepseek.com/chat/completions");
  });

  it("returns the caption and computes cost from reported tokens", async () => {
    stubFetch([
      () =>
        jsonResponse({
          choices: [{ finish_reason: "stop", message: { content: '  "Kek lapis RM45"  ' } }],
          usage: { total_tokens: 500 },
        }),
    ]);
    const result = await generateWithDeepSeek(REQUEST);
    expect(result.source).toBe("deepseek");
    expect(result.caption).toBe("Kek lapis RM45");
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("enforces the emoji ceiling like every other provider", async () => {
    stubFetch([
      () =>
        jsonResponse({
          choices: [
            { finish_reason: "stop", message: { content: "Sedap 🎂🔥📦🎉✨ kek lapis" } },
          ],
        }),
    ]);
    const result = await generateWithDeepSeek(REQUEST);
    const emoji = [...result.caption.matchAll(/\p{Extended_Pictographic}/gu)].length;
    expect(emoji).toBeLessThanOrEqual(3);
  });

  it("surfaces an auth failure instead of returning an empty caption", async () => {
    stubFetch([() => jsonResponse({ error: { message: "Authentication Fails" } }, 401)]);
    await expect(generateWithDeepSeek(REQUEST)).rejects.toThrow(/401/);
  });
});

describe("provider chain ordering", () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    process.env.OPENROUTER_API_KEY = "or-test";
    delete process.env.META_AI_API_KEY;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_ENABLED;
    vi.restoreAllMocks();
  });

  it("prefers DeepSeek over the free tier", async () => {
    const fetchMock = stubFetch([
      () =>
        jsonResponse({
          choices: [{ finish_reason: "stop", message: { content: "Dari DeepSeek" } }],
          usage: { total_tokens: 200 },
        }),
    ]);

    const result = await generateCaption({ ...REQUEST });
    expect(result.source).toBe("deepseek");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls to OpenRouter when DeepSeek fails", async () => {
    const fetchMock = stubFetch([
      () => jsonResponse({ error: { message: "Insufficient Balance" } }, 402),
      () =>
        jsonResponse({
          choices: [{ finish_reason: "stop", message: { content: "Dari OpenRouter" } }],
          usage: { cost: 0 },
        }),
    ]);

    const result = await generateCaption({ ...REQUEST });
    expect(result.source).toBe("openrouter");
    expect(result.caption).toBe("Dari OpenRouter");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls all the way to the local template when every provider fails", async () => {
    stubFetch([() => new Response("boom", { status: 500 })]);
    const result = await generateCaption({ ...REQUEST });
    expect(result.source).toBe("mock-fallback");
    expect(result.caption.length).toBeGreaterThan(20);
  });
});

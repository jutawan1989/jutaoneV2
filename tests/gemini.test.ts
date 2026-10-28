import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateWithGemini, geminiConfigured } from "@/lib/ai/gemini";

const REQUEST = { text: "Kek lapis Sarawak, RM45 sekotak", locale: "ms", region: "MY" } as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type FetchMock = ReturnType<typeof vi.fn>;

describe("Gemini adapter (gemini-2.0-flash)", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_ENABLED;
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_ENABLED;
    delete process.env.GEMINI_MODEL;
  });

  it("is switchable off without removing the key", () => {
    expect(geminiConfigured()).toBe(true);
    process.env.GEMINI_ENABLED = "0";
    expect(geminiConfigured()).toBe(false);
  });

  it("posts gemini-2.0-flash to the OpenAI-compatible endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: "Kek lapis sedap! Cuba hari ini." } }],
        usage: { total_tokens: 40 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateWithGemini(REQUEST);
    expect(result.source).toBe("gemini");
    expect(result.model).toBe("gemini-2.0-flash");
    expect(result.caption.length).toBeGreaterThan(0);

    const [url, init] = (fetchMock as FetchMock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    expect(body.model).toBe("gemini-2.0-flash");
  });

  it("throws a readable error when the key is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: { message: "API key not valid" } }, 400)),
    );
    await expect(generateWithGemini(REQUEST)).rejects.toThrow(/Gemini responded 400/);
  });
});

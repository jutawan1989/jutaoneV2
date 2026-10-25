import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The playground endpoint must be unlimited for the admin but must never write
 * public analytics. These tests stub the database layer and the AI adapter so
 * the assertions are about what the route chooses to record, not about content.
 */

const logEvent = vi.fn(async () => {});
const recordAiSpend = vi.fn(async () => {});
const recordDemoAttempt = vi.fn(async () => {});
const generateCaption = vi.fn(async () => ({
  caption: "Kapsyen ujian",
  source: "mock" as const,
  model: "local-template",
  costUsd: 0,
  latencyMs: 12,
}));

vi.mock("@/lib/analytics/events", () => ({ logEvent, parseUtm: () => ({}) }));
vi.mock("@/lib/ai/budget", () => ({
  getKillSwitchState: async () => ({ disabled: false, reason: null, spentUsd: 0, limitUsd: 50 }),
  recordAiSpend,
}));
vi.mock("@/lib/ai", () => ({ generateCaption }));
vi.mock("@/lib/trial/limit", () => ({ recordDemoAttempt, evaluateDemoAccess: async () => ({ allowed: true }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const { POST } = await import("@/app/api/admin/generate/route");

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/admin/generate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const PASSWORD = "correct-horse-battery-staple";

describe("playground generate endpoint", () => {
  beforeEach(() => {
    process.env.ADMIN_TEST_PASSWORD = PASSWORD;
    vi.clearAllMocks();
  });
  afterEach(() => {
    delete process.env.ADMIN_TEST_PASSWORD;
  });

  it("refuses an unauthenticated request", async () => {
    const response = await POST(request({ text: "produk ujian" }) as never);
    expect(response.status).toBe(401);
    expect(generateCaption).not.toHaveBeenCalled();
  });

  it("never records a demo attempt or a public event", async () => {
    const response = await POST(
      request(
        { text: "Kek lapis Sarawak RM45", locale: "ms", region: "MY" },
        { authorization: `Bearer ${PASSWORD}` },
      ) as never,
    );

    expect(response.status).toBe(200);
    expect(generateCaption).toHaveBeenCalledOnce();
    // The brief's requirement: public analytics stay clean.
    expect(logEvent).not.toHaveBeenCalled();
    expect(recordDemoAttempt).not.toHaveBeenCalled();
  });

  it("is not capped at two runs like the public demo", async () => {
    for (let i = 0; i < 5; i += 1) {
      const response = await POST(
        request(
          { text: `produk ujian nombor ${i}` },
          { authorization: `Bearer ${PASSWORD}` },
        ) as never,
      );
      expect(response.status).toBe(200);
    }
    expect(generateCaption).toHaveBeenCalledTimes(5);
  });

  it("still records spend, so the route cannot burn budget invisibly", async () => {
    await POST(
      request({ text: "produk ujian" }, { authorization: `Bearer ${PASSWORD}` }) as never,
    );
    expect(recordAiSpend).toHaveBeenCalledOnce();
  });

  it("keeps input validation", async () => {
    const short = await POST(
      request({ text: "abc" }, { authorization: `Bearer ${PASSWORD}` }) as never,
    );
    expect(short.status).toBe(400);
    expect(generateCaption).not.toHaveBeenCalled();
  });
});

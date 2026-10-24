import { beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_DEVICE_MAX_ATTEMPTS,
  DEMO_MAX_ATTEMPTS,
  evaluateDemoAccess,
  recordDemoAttempt,
} from "@/lib/trial/limit";
import { memoryStore, resetMemoryStore } from "@/lib/trial/store";
import { identifyVisitor } from "@/lib/trial/visitor";

function requestHeaders(userAgent = "Mozilla/5.0 (iPhone) Safari/605", ip = "203.0.113.10") {
  const headers = new Headers({
    "user-agent": userAgent,
    "accept-language": "ms-MY,ms;q=0.9",
    "cf-connecting-ip": ip,
  });
  return headers;
}

describe("demo trial control", () => {
  beforeEach(() => {
    resetMemoryStore();
    process.env.VISITOR_HASH_SALT = "test-salt-that-is-long-enough";
  });

  it(`allows ${DEMO_MAX_ATTEMPTS} attempts then blocks the visitor`, async () => {
    const visitor = identifyVisitor(requestHeaders());

    const first = await evaluateDemoAccess(visitor, memoryStore);
    expect(first).toMatchObject({ allowed: true, used: 0, max: DEMO_MAX_ATTEMPTS, remaining: 2 });

    await recordDemoAttempt(visitor, { locale: "ms", region: "MY" }, memoryStore);
    const second = await evaluateDemoAccess(visitor, memoryStore);
    expect(second).toMatchObject({ allowed: true, used: 1, remaining: 1 });

    await recordDemoAttempt(visitor, { locale: "ms", region: "MY" }, memoryStore);
    const third = await evaluateDemoAccess(visitor, memoryStore);
    expect(third).toMatchObject({ allowed: false, used: 2, remaining: 0, reason: "visitor_limit" });
  });

  it("persists the limit across requests with the same IP and device", async () => {
    const a = identifyVisitor(requestHeaders());
    const b = identifyVisitor(requestHeaders());

    await recordDemoAttempt(a, { locale: "ms", region: "MY" }, memoryStore);
    await recordDemoAttempt(a, { locale: "ms", region: "MY" }, memoryStore);

    const decision = await evaluateDemoAccess(b, memoryStore);
    expect(decision.allowed).toBe(false);
  });

  it("blocks a device that rotates its IP", async () => {
    const device = "Mozilla/5.0 (Linux; Android 14) Chrome/126";

    for (let index = 0; index < DEMO_DEVICE_MAX_ATTEMPTS; index += 1) {
      const visitor = identifyVisitor(requestHeaders(device, `198.51.100.${index + 1}`));
      await recordDemoAttempt(visitor, { locale: "ms", region: "MY" }, memoryStore);
    }

    const rotated = identifyVisitor(requestHeaders(device, "198.51.100.99"));
    const decision = await evaluateDemoAccess(rotated, memoryStore);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("device_limit");
  });

  it("hashes the visitor identity instead of storing raw values", async () => {
    const visitor = identifyVisitor(requestHeaders());
    expect(visitor.ipHash).not.toContain("203.0.113.10");
    expect(visitor.visitorKey).toHaveLength(64);
    expect(visitor.ipHash).toHaveLength(64);
  });

  it("treats a different device as a new visitor", async () => {
    const phone = identifyVisitor(requestHeaders("iPhone UA"));
    await recordDemoAttempt(phone, { locale: "ms", region: "MY" }, memoryStore);
    await recordDemoAttempt(phone, { locale: "ms", region: "MY" }, memoryStore);

    const laptop = identifyVisitor(requestHeaders("MacBook UA", "203.0.113.10"));
    const decision = await evaluateDemoAccess(laptop, memoryStore);
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(DEMO_MAX_ATTEMPTS);
  });
});

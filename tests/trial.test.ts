import { beforeEach, describe, expect, it } from "vitest";
import {
  COPY_FREE_GENERATIONS,
  DAILY_GENERATION_QUOTA,
  evaluateDemoAccess,
  localDay,
  recordDemoAttempt,
} from "@/lib/trial/limit";
import { memoryStore, resetMemoryStore } from "@/lib/trial/store";
import type { Visitor } from "@/lib/trial/visitor";

const VISITOR: Visitor = {
  ipHash: "ip-hash-a",
  deviceHash: "device-hash-a",
  visitorKey: "visitor-hash-a",
};

/** Advances `records` generations for a visitor and returns the last decision. */
async function useGenerations(count: number, visitor = VISITOR, now = new Date()) {
  for (let i = 0; i < count; i += 1) {
    await recordDemoAttempt(visitor, { locale: "ms", region: "MY" }, memoryStore);
  }
  return evaluateDemoAccess(visitor, memoryStore, now);
}

describe("daily generation quota", () => {
  beforeEach(() => resetMemoryStore());

  it("starts with a full daily quota, not a lifetime cap", async () => {
    const decision = await evaluateDemoAccess(VISITOR, memoryStore);
    expect(decision.max).toBe(DAILY_GENERATION_QUOTA);
    expect(decision.used).toBe(0);
    expect(decision.remaining).toBe(DAILY_GENERATION_QUOTA);
    expect(decision.allowed).toBe(true);
  });

  it("allows five generations then blocks with daily_limit", async () => {
    const afterFour = await useGenerations(4);
    expect(afterFour.allowed).toBe(true);
    expect(afterFour.remaining).toBe(1);

    const afterFive = await useGenerations(1);
    expect(afterFive.allowed).toBe(false);
    expect(afterFive.used).toBe(5);
    expect(afterFive.remaining).toBe(0);
    expect(afterFive.reason).toBe("daily_limit");
  });

  it("resets on the next local day", async () => {
    await useGenerations(5);
    const exhausted = await evaluateDemoAccess(VISITOR, memoryStore);
    expect(exhausted.allowed).toBe(false);

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const fresh = await evaluateDemoAccess(VISITOR, memoryStore, tomorrow);
    expect(fresh.allowed).toBe(true);
    expect(fresh.used).toBe(0);
    expect(fresh.remaining).toBe(DAILY_GENERATION_QUOTA);
    expect(fresh.day).toBe(localDay(tomorrow));
  });

  it("scopes the count to the visitor's local day", async () => {
    await useGenerations(5);
    const today = localDay();
    expect(await memoryStore.countByVisitor(VISITOR.visitorKey, today)).toBe(5);
    expect(await memoryStore.countByVisitor(VISITOR.visitorKey, "1999-01-01")).toBe(0);
  });
});

describe("copy-lock hook", () => {
  beforeEach(() => resetMemoryStore());

  it("allows copy for the first two generations", async () => {
    const first = await evaluateDemoAccess(VISITOR, memoryStore);
    expect(first.copyAllowed).toBe(true);

    await useGenerations(1);
    const second = await evaluateDemoAccess(VISITOR, memoryStore);
    expect(second.copyAllowed).toBe(true);
    expect(COPY_FREE_GENERATIONS).toBe(2);
  });

  it("locks copy from the third generation while still allowing generation", async () => {
    const third = await useGenerations(2);
    // The text is still produced; only copying is locked.
    expect(third.allowed).toBe(true);
    expect(third.copyAllowed).toBe(false);

    const fifth = await useGenerations(2);
    expect(fifth.allowed).toBe(true);
    expect(fifth.copyAllowed).toBe(false);
  });

  it("never allows copy once the quota is exhausted", async () => {
    const exhausted = await useGenerations(5);
    expect(exhausted.allowed).toBe(false);
    expect(exhausted.copyAllowed).toBe(false);
  });
});

describe("device fingerprint guard", () => {
  beforeEach(() => resetMemoryStore());

  it("does not let a new IP reset the quota for the same device", async () => {
    await useGenerations(5);

    // Same browser, new IP: the visitor hash changes, the device hash does not.
    const rotated: Visitor = {
      ipHash: "ip-hash-b",
      deviceHash: VISITOR.deviceHash,
      visitorKey: "visitor-hash-b",
    };
    const decision = await evaluateDemoAccess(rotated, memoryStore);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("daily_limit");
  });
});

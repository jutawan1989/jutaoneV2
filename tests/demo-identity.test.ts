import { beforeEach, describe, expect, it } from "vitest";
import {
  evaluateDemoAccess,
  recordDemoAttempt,
} from "@/lib/trial/limit";
import { memoryStore, resetMemoryStore } from "@/lib/trial/store";
import type { Visitor } from "@/lib/trial/visitor";

/**
 * Session identity for the demo/ad-generator quota (Boss bug, Oct 2026).
 *
 * The dashboard summed tokens by `owner_ref` from the `jo_session` cookie,
 * but `/api/demo` counted quota by the anonymous visitor hash. On a shared
 * IP (office, coworking, CGNAT) every stranger ate from the same bucket, so
 * an active member with 2.26M tokens hit 429 "daily_limit" on the first
 * click — and the copy lock fired on top.
 *
 * Rule: anonymous visitors share the visitor-hash quota; a signed-in member
 * uses their own `owner_ref` as the quota key, so their quota is theirs.
 */
function quotaKey(sessionOwner: string | null, visitorKey: string): string {
  return sessionOwner ?? visitorKey;
}

const ANON_A: Visitor = { ipHash: "shared-ip", deviceHash: "device-a", visitorKey: "anon-hash-a" };
const ANON_B: Visitor = { ipHash: "shared-ip", deviceHash: "device-b", visitorKey: "anon-hash-b" };
const MEMBER: Visitor = { ipHash: "shared-ip", deviceHash: "member-device", visitorKey: "owner-ref-boss" };

describe("demo quota identity (member session vs anonymous)", () => {
  beforeEach(() => resetMemoryStore());

  it("anonymous visitors are counted by their own visitor hash", async () => {
    const keyA = quotaKey(null, ANON_A.visitorKey);
    const keyB = quotaKey(null, ANON_B.visitorKey);
    expect(keyA).toBe("anon-hash-a");
    expect(keyB).toBe("anon-hash-b");
    expect(keyA).not.toBe(keyB);
  });

  it("a signed-in member is counted by owner_ref, not the visitor hash", async () => {
    const key = quotaKey(MEMBER.visitorKey, ANON_A.visitorKey);
    expect(key).toBe("owner-ref-boss");
  });

  it("strangers on a shared IP do not eat the member's quota", async () => {
    // Five anonymous generations fill the shared bucket.
    for (let i = 0; i < 5; i += 1) {
      await recordDemoAttempt(ANON_B, { locale: "ms", region: "MY" }, memoryStore);
    }
    const anonBlocked = await evaluateDemoAccess(ANON_B, memoryStore);
    expect(anonBlocked.allowed).toBe(false);

    // The member's own bucket is untouched.
    const memberAccess = await evaluateDemoAccess(MEMBER, memoryStore);
    expect(memberAccess.allowed).toBe(true);
    expect(memberAccess.remaining).toBe(memberAccess.max);
  });

  it("the member's generations do not count against the anonymous bucket", async () => {
    for (let i = 0; i < 3; i += 1) {
      await recordDemoAttempt(MEMBER, { locale: "ms", region: "MY" }, memoryStore);
    }
    const anonAccess = await evaluateDemoAccess(ANON_A, memoryStore);
    expect(anonAccess.allowed).toBe(true);
    expect(anonAccess.used).toBe(0);
  });
});

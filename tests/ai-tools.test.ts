import { describe, expect, it } from "vitest";
import {
  AFFILIATE_ENSURE_API,
  BIZ_SEARCH_API,
  CHAT_API,
  isInsufficient,
  paywallMessage,
  readBalanceAfter,
} from "@/lib/ai-tools";
import { generateReferralCode, isValidReferralCode } from "@/lib/affiliate";

describe("ai-tools contract (Ali's dashboard buttons)", () => {
  it("pins the chat endpoint Ali must call", () => {
    expect(CHAT_API.url).toBe("/api/chat");
    expect(CHAT_API.method).toBe("POST");
    expect(CHAT_API.costTokens).toBe(5_000);
    expect([...CHAT_API.bodyKeys]).toEqual(["message", "locale", "rid"]);
  });

  it("pins the live-search endpoint Ali must call", () => {
    expect(BIZ_SEARCH_API.url).toBe("/api/biz-match/search");
    expect(BIZ_SEARCH_API.method).toBe("GET");
    expect(BIZ_SEARCH_API.costTokens).toBe(10_000);
    expect([...BIZ_SEARCH_API.queryKeys]).toEqual(["q", "country", "rid"]);
  });

  it("pins the affiliate-ensure endpoint Ali must call", () => {
    expect(AFFILIATE_ENSURE_API.url).toBe("/api/affiliate/ensure");
    expect(AFFILIATE_ENSURE_API.method).toBe("POST");
    expect([...AFFILIATE_ENSURE_API.bodyKeys]).toEqual([]);
  });

  it("detects the shared 402 paywall both tools return", () => {
    expect(isInsufficient({ code: "insufficient_tokens", required: 10_000, balance: 0 })).toBe(true);
    expect(isInsufficient({ ok: true })).toBe(false);
    expect(isInsufficient(null)).toBe(false);
  });

  it("reads the balance from either billing shape", () => {
    expect(readBalanceAfter({ billing: { balanceAfter: 2_240_000 } })).toBe(2_240_000);
    expect(readBalanceAfter({ balanceAfter: 100 })).toBe(100);
    expect(readBalanceAfter({ ok: true })).toBeNull();
  });

  it("writes a Malay paywall line with grouped numbers", () => {
    expect(paywallMessage(10_000, 500)).toContain("10,000");
    expect(paywallMessage(10_000, 500)).toContain("500");
  });
});

describe("auto-generated referral codes", () => {
  it("mints 8-char codes that satisfy the DB check constraint", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode();
      expect(code).toHaveLength(8);
      expect(isValidReferralCode(code)).toBe(true);
      seen.add(code);
    }
    // 200 draws from a 31^8 space must not collide.
    expect(seen.size).toBe(200);
  });

  it("uses no lookalike characters (readable over WhatsApp)", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateReferralCode()).not.toMatch(/[01ilo]/);
    }
  });
});

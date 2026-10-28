import { describe, expect, it } from "vitest";
import { normalizeAssistantAnswer } from "@/app/api/chat/route";
import { CHAT_COST_TOKENS } from "@/lib/tokens";

describe("Smart Assistant (chat, 5,000 tokens per answer)", () => {
  it("costs 5,000 tokens per answered reply", () => {
    expect(CHAT_COST_TOKENS).toBe(5_000);
  });

  it("keeps answers as plain text within the budget", () => {
    const answer = normalizeAssistantAnswer('```\n"Jual di TikTok Shop."\n```');
    expect(answer).toBe("Jual di TikTok Shop.");
    expect(answer.length).toBeLessThanOrEqual(1200);
  });

  it("trims long answers instead of failing", () => {
    const answer = normalizeAssistantAnswer("a".repeat(5000));
    expect(answer.length).toBeLessThanOrEqual(1200);
  });
});

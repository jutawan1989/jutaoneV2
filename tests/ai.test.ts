import { describe, expect, it } from "vitest";
import { generateCaption } from "@/lib/ai";
import { generateMockCaption } from "@/lib/ai/mock";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { findBannedPhrases } from "@/lib/compliance";
import { LOCALES } from "@/lib/i18n/config";

const PRODUCT = "Biskut mentega bakar sendiri, RM25 sebalang, penghantaran Lembah Klang";

describe("AI adapter (D1)", () => {
  it("falls back to the local template when no Meta key is configured", async () => {
    delete process.env.META_AI_API_KEY;
    const result = await generateCaption({ text: PRODUCT, locale: "ms", region: "MY" });
    expect(result.source).toBe("mock");
    expect(result.costUsd).toBe(0);
    expect(result.caption).toContain("RM25 sebalang");
  });

  it("returns a caption under 3 seconds locally", async () => {
    const startedAt = Date.now();
    await generateCaption({ text: PRODUCT, locale: "id", region: "ID" });
    expect(Date.now() - startedAt).toBeLessThan(3000);
  });

  it.each(LOCALES)("%s caption stays within the caption budget", (locale) => {
    const result = generateMockCaption({ text: PRODUCT.repeat(3), locale, region: "MY" });
    expect(result.caption.length).toBeLessThanOrEqual(280);
    expect(result.caption.length).toBeGreaterThan(20);
  });

  it.each(LOCALES)("%s caption passes the compliance filter", (locale) => {
    const result = generateMockCaption({ text: PRODUCT, locale, region: "MY" });
    expect(findBannedPhrases(result.caption)).toEqual([]);
  });

  it("is deterministic for identical input", () => {
    const a = generateMockCaption({ text: PRODUCT, locale: "ms", region: "MY" });
    const b = generateMockCaption({ text: PRODUCT, locale: "ms", region: "MY" });
    expect(a.caption).toBe(b.caption);
  });

  it("writes the system prompt in the requested language and market", () => {
    const prompt = buildSystemPrompt("ms", "MY");
    expect(prompt).toContain("Malaysia");
    expect(prompt).toContain("Bahasa Melayu");
    expect(prompt).toContain("Never promise profit");
  });
});

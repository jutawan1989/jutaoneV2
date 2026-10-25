import { describe, expect, it } from "vitest";
import {
  MAX_CAPTION_EMOJI,
  capEmoji,
  countEmoji,
  normalizeCaption,
} from "@/lib/ai/caption";

describe("emoji ceiling", () => {
  it("counts emoji clusters, not code points", () => {
    // Flag = two regional indicators, wave = surrogate pair + VS16.
    expect(countEmoji("🇲🇾")).toBe(1);
    expect(countEmoji("👋🏽")).toBe(1); // skin tone modifier
    expect(countEmoji("👨‍👩‍👧")).toBe(1); // ZWJ family
    expect(countEmoji("no emoji here")).toBe(0);
  });

  it("keeps emoji at or under the ceiling untouched", () => {
    const text = "Kek lapis RM45 🎂 #keklapis";
    expect(countEmoji(text)).toBe(1);
    expect(capEmoji(text)).toBe(text);
  });

  it("drops only the excess, keeping the earliest emoji", () => {
    const text = "Sedap 🎂 gila 🔥 order 📦 sekarang ✨ #keklapis";
    const capped = capEmoji(text);

    expect(countEmoji(capped)).toBe(MAX_CAPTION_EMOJI);
    expect(capped).toContain("🎂");
    expect(capped).toContain("🔥");
    expect(capped).toContain("📦");
    expect(capped).not.toContain("✨");
  });

  it("removes whole clusters instead of splitting them", () => {
    const capped = capEmoji("a 🇲🇾 b 👨‍👩‍👧 c 🎂 d 🎉");
    expect(countEmoji(capped)).toBe(3);
    // The flag and the ZWJ family must survive intact.
    expect(capped).toContain("🇲🇾");
    expect(capped).toContain("👨‍👩‍👧");
    expect(capped).not.toContain("🎉");
  });

  it("does not leave doubled spaces where an emoji was removed", () => {
    const capped = capEmoji("one 🎂 two 🔥 three 📦 four 🎉 five");
    expect(capped).not.toMatch(/[ \t]{2,}/);
    expect(capped.endsWith(" ")).toBe(false);
  });

  it("honours zero emoji when asked", () => {
    expect(capEmoji("Kek 🎂 RM45 🔥", 0)).toBe("Kek RM45");
  });
});

describe("normalizeCaption", () => {
  it("enforces the ceiling as a guarantee, not a prompt hint", () => {
    const raw = "  \nJom cuba 🎂✨🔥📦🎉 kek lapis RM45!  \n";
    const caption = normalizeCaption(raw);
    expect(countEmoji(caption)).toBeLessThanOrEqual(MAX_CAPTION_EMOJI);
    expect(caption.startsWith("Jom cuba")).toBe(true);
  });

  it("still strips code fences and wrapping quotes", () => {
    expect(normalizeCaption('```\n"Kek lapis RM45"\n```')).toBe("Kek lapis RM45");
  });

  it("keeps the emoji cap when the caption is also truncated", () => {
    const raw = `${"x".repeat(390)} 🎂🔥📦🎉`;
    const caption = normalizeCaption(raw);
    expect(caption.length).toBeLessThanOrEqual(400);
    expect(countEmoji(caption)).toBeLessThanOrEqual(MAX_CAPTION_EMOJI);
  });
});

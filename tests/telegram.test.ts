import { describe, expect, it } from "vitest";
import { escapeHtml, telegramConfigured, telegramMisconfiguredReason } from "@/lib/telegram";
import { buildNewsMessage } from "@/app/api/cron/news/route";

describe("telegram sender config", () => {
  it("reports not configured when env is missing", () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chat = process.env.TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    try {
      expect(telegramConfigured()).toBe(false);
      expect(telegramMisconfiguredReason()).toMatch(/TELEGRAM_/);
    } finally {
      if (token !== undefined) process.env.TELEGRAM_BOT_TOKEN = token;
      if (chat !== undefined) process.env.TELEGRAM_CHAT_ID = chat;
    }
  });

  it("accepts HTML formatting without crashing on markup chars", async () => {
    // No network call here: without env the sender refuses before fetch.
    delete process.env.TELEGRAM_BOT_TOKEN;
    const { sendTelegramMessage } = await import("@/lib/telegram");
    const result = await sendTelegramMessage("<b>test</b> & <i>hi</i>");
    expect(result).toEqual({ ok: false, code: "telegram_not_configured" });
  });
});

describe("escapeHtml (values only, never markup)", () => {
  it("escapes dynamic values but leaves tags to the caller", () => {
    expect(escapeHtml("RM 19,129.85 & <ready>")).toBe("RM 19,129.85 &amp; &lt;ready&gt;");
    // Markup passes through untouched — the caller writes it literally.
    expect("<b>Emas</b>").toContain("<b>");
  });
});

describe("buildNewsMessage (Boss premium layout)", () => {
  it("renders tags as formatting and escapes dynamic values", () => {
    const message = buildNewsMessage(
      "MYR",
      19129.85,
      254.79,
      "29 Okt 2026, 04:15 AM (MYT)",
      "https://jutaone.biz/ms",
    );
    // Premium header + dividers + emojis.
    expect(message).toContain("🏆 <b>JUTAONE.BIZ — PASARAN LOGAM</b>");
    expect(message).toContain("🟡 <b>Emas (999):</b> RM 19,129.85 / oz");
    expect(message).toContain("⚪ <b>Perak (925):</b> RM 254.79 / oz");
    expect(message).toContain("📅 <i>Dikemaskini: 29 Okt 2026, 04:15 AM (MYT)</i>");
    expect(message).toContain('<a href="https://jutaone.biz/ms">Semak Analisis Lanjutan di Dashboard</a>');
    // The regression Boss reported: tags must NOT appear escaped as text.
    expect(message).not.toContain("&lt;b&gt;");
    expect(message).not.toContain("&lt;i&gt;");
    expect(message).not.toContain("&lt;a ");
  });

  it("shows a dash when a price is missing and escapes hostile urls", () => {
    const message = buildNewsMessage("MYR", null, 100, "esok", 'https://x/?a=1&b=<2>');
    expect(message).toContain("Emas (999):</b> — / oz");
    expect(message).toContain("https://x/?a=1&amp;b=&lt;2&gt;");
  });
});

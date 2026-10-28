import { describe, expect, it } from "vitest";
import { telegramConfigured, telegramMisconfiguredReason } from "@/lib/telegram";

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

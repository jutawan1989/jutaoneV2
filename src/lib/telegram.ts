/**
 * Telegram sender for the JutaOne Official News channel.
 *
 * Credentials NEVER live here — they come from Worker secrets / env:
 *   TELEGRAM_BOT_TOKEN — BotFather token for the channel bot
 *   TELEGRAM_CHAT_ID   — channel id (e.g. -100xxxxxxxxxx)
 *
 * `parse_mode: HTML` so callers can use <b>, <i> and <code> for readable
 * market updates. Messages are capped at Telegram's 4096-char limit.
 */

const API_BASE = "https://api.telegram.org";
const MAX_CHARS = 4096;

/**
 * Escapes a DYNAMIC value for embedding inside an HTML-parsed Telegram
 * message. Markup itself (<b>, <i>, <a>) must NOT pass through here —
 * escaping the whole message turns tags into visible text (the bug Boss
 * reported: `<b>` showing literally in the channel).
 */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export function telegramMisconfiguredReason(): string | null {
  if (!process.env.TELEGRAM_BOT_TOKEN) return "TELEGRAM_BOT_TOKEN is not set";
  if (!process.env.TELEGRAM_CHAT_ID) return "TELEGRAM_CHAT_ID is not set";
  return null;
}

/**
 * Sends one message to the configured channel. Returns ok:true on success,
 * ok:false with a short machine-readable code otherwise — the cron route maps
 * that code to the HTTP response, and nothing secret is ever logged.
 */
export async function sendTelegramMessage(
  text: string,
): Promise<{ ok: true } | { ok: false; code: string }> {
  const misconfigured = telegramMisconfiguredReason();
  if (misconfigured) {
    return { ok: false, code: "telegram_not_configured" };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN as string;
  const chatId = process.env.TELEGRAM_CHAT_ID as string;
  // The caller owns the markup: only dynamic values are escaped at the call
  // site (via escapeHtml), so tags here render as formatting, not text.
  const body = text.slice(0, MAX_CHARS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: body,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false, code: "telegram_unreachable" };
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    // Common, actionable failures get their own codes; the raw body stays
    // server-side so a bad chat id never leaks token fragments to callers.
    if (response.status === 401) return { ok: false, code: "telegram_bad_token" };
    if (response.status === 400 && /chat/i.test(detail)) {
      return { ok: false, code: "telegram_bad_chat" };
    }
    if (response.status === 429) return { ok: false, code: "telegram_rate_limited" };
    console.error("[jutaone] telegram send failed", response.status, detail.slice(0, 120));
    return { ok: false, code: "telegram_send_failed" };
  }

  return { ok: true };
}

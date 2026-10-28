import { NextResponse, type NextRequest } from "next/server";
import {
  getPublicMetalPrices,
  type PublicMetalCurrency,
} from "@/lib/goldprice";
import { sendTelegramMessage, escapeHtml, telegramMisconfiguredReason } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/news — gold/silver update for the Telegram news channel.
 *
 * Guarded by `CRON_SECRET` (Worker secret, `x-cron-secret` header or
 * `?secret=`), so a stranger cannot spend our Telegram quota. On success the
 * channel gets one formatted market message; failures name the cause
 * (vendor down vs Telegram misconfigured) instead of a bare 500.
 *
 * Query params:
 *   currency=MYR|IDR|USD  (default MYR)
 *   dry=1                 format only, do not send (for testing)
 *   secret=...            alternative to the x-cron-secret header
 */

function authorised(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected) return false;
  const url = request.nextUrl;
  const supplied =
    request.headers.get("x-cron-secret")?.trim() ??
    url.searchParams.get("secret")?.trim() ??
    "";
  return supplied.length > 0 && supplied === expected;
}

function formatMoney(value: number | null, currency: PublicMetalCurrency): string {
  if (value === null) return "—";
  if (currency === "IDR") return `Rp${value.toLocaleString("id-ID")}`;
  if (currency === "USD")
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `RM ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const DIVIDER = "━━━━━━━━━━━━━━━━━━";

/**
 * Boss-approved premium layout. Markup (<b>, <i>, <a>) stays literal —
 * only dynamic values (prices, timestamp) go through escapeHtml, so tags
 * render as formatting and never as visible text.
 */
export function buildNewsMessage(
  currency: PublicMetalCurrency,
  gold: number | null,
  silver: number | null,
  when: string,
  dashboardUrl: string,
): string {
  return (
    `🏆 <b>JUTAONE.BIZ — PASARAN LOGAM</b>\n` +
    `${DIVIDER}\n` +
    `🟡 <b>Emas (999):</b> ${escapeHtml(formatMoney(gold, currency))} / oz\n` +
    `⚪ <b>Perak (925):</b> ${escapeHtml(formatMoney(silver, currency))} / oz\n` +
    `${DIVIDER}\n` +
    `📅 <i>Dikemaskini: ${escapeHtml(when)}</i>\n` +
    `🔗 <a href="${escapeHtml(dashboardUrl)}">Semak Analisis Lanjutan di Dashboard</a>`
  );
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ code: "unauthorised" }, { status: 401 });
  }

  const requested = request.nextUrl.searchParams.get("currency")?.toUpperCase();
  const currency: PublicMetalCurrency =
    requested === "IDR" || requested === "USD" ? requested : "MYR";

  const prices = await getPublicMetalPrices(currency);
  if (!prices) {
    return NextResponse.json({ code: "metals_unavailable" }, { status: 503 });
  }

  const when = new Date(prices.fetchedAt).toLocaleString("ms-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://jutaone.biz").replace(/\/$/, "");
  const message = buildNewsMessage(
    currency,
    prices.gold,
    prices.silver,
    `${when} (MYT)`,
    `${siteUrl}/ms`,
  );

  if (request.nextUrl.searchParams.get("dry") === "1") {
    return NextResponse.json({ ok: true, dry: true, currency, message });
  }

  const misconfigured = telegramMisconfiguredReason();
  if (misconfigured) {
    return NextResponse.json({ code: "telegram_not_configured" }, { status: 503 });
  }

  const sent = await sendTelegramMessage(message);
  if (!sent.ok) {
    const status = sent.code === "telegram_rate_limited" ? 429 : 502;
    return NextResponse.json({ code: sent.code }, { status });
  }

  return NextResponse.json({ ok: true, currency, source: prices.source });
}

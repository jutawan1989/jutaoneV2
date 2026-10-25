import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { generateCaption } from "@/lib/ai";
import { getKillSwitchState, recordAiSpend } from "@/lib/ai/budget";
import { isLocale } from "@/lib/i18n/config";
import { ADMIN_COOKIE, authorisedByHeader, verifySession } from "@/lib/admin/auth";
import type { Region } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_CHARS = 5;
const MAX_CHARS = 200;
const REGIONS: Region[] = ["MY", "ID", "OTHER"];

/**
 * Internal generation endpoint.
 *
 * Deliberately different from `/api/demo`:
 *  - no `evaluateDemoAccess`, no `recordDemoAttempt`: the admin is not a visitor
 *    and must not consume a stranger's allowance;
 *  - no `logEvent`: test captions stay out of the public `events` table;
 *  - still subject to the kill switch and still recorded in `ai_usage`, because
 *    an unlimited route that also skips the spend ceiling is a way to burn the
 *    whole API budget with no trace. The brief asked for clean analytics, not
 *    invisible spend.
 */
export async function POST(request: NextRequest) {
  const jar = await cookies();
  const authed =
    verifySession(jar.get(ADMIN_COOKIE)?.value) || authorisedByHeader(request.headers);

  if (!authed) {
    return NextResponse.json({ code: "unauthorised" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { text?: unknown; locale?: unknown; region?: unknown }
    | null;

  const rawText = typeof body?.text === "string" ? body.text : "";
  const text = rawText.replace(/\s+/g, " ").trim();

  if (text.length < MIN_CHARS) {
    return NextResponse.json({ code: "text_too_short" }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ code: "text_too_long", max: MAX_CHARS }, { status: 400 });
  }

  const locale = isLocale(body?.locale as string) ? (body!.locale as "en" | "ms" | "id") : "ms";
  const region = REGIONS.includes(body?.region as Region)
    ? (body!.region as Region)
    : "MY";

  const killSwitch = await getKillSwitchState();
  if (killSwitch.disabled) {
    return NextResponse.json(
      { code: "demo_unavailable", reason: killSwitch.reason },
      { status: 503 },
    );
  }

  const result = await generateCaption({ text, locale, region });
  await recordAiSpend(result.costUsd, { model: result.model, locale });

  return NextResponse.json({
    caption: result.caption,
    source: result.source,
    model: result.model,
    latencyMs: result.latencyMs,
    costUsd: result.costUsd,
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { generateCaption } from "@/lib/ai";
import { getKillSwitchState, recordAiSpend } from "@/lib/ai/budget";
import { logEvent, parseUtm } from "@/lib/analytics/events";
import { resolveVariant } from "@/lib/analytics/variant";
import { detectLocale, detectRegion } from "@/lib/geo";
import { isLocale } from "@/lib/i18n/config";
import { evaluateDemoAccess, recordDemoAttempt } from "@/lib/trial/limit";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_CHARS = 5;
const MAX_CHARS = 200;

type DemoBody = { text?: unknown; locale?: unknown };

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as DemoBody | null;
  const rawText = typeof body?.text === "string" ? body.text : "";
  const text = rawText.replace(/\s+/g, " ").trim();

  const headers = request.headers;
  const requested = typeof body?.locale === "string" ? body.locale : null;
  const locale = isLocale(requested) ? requested : detectLocale(headers);
  const region = detectRegion(headers);
  const visitor = identifyVisitor(headers);
  const variant = resolveVariant(visitor.visitorKey, request.nextUrl.searchParams.get("variant"));
  const utm = parseUtm(request.nextUrl.search);

  if (text.length < MIN_CHARS) {
    return NextResponse.json(
      { code: "text_too_short", remaining: null, max: null, variant },
      { status: 400 },
    );
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { code: "text_too_long", remaining: null, max: MAX_CHARS, variant },
      { status: 400 },
    );
  }

  const killSwitch = await getKillSwitchState();
  if (killSwitch.disabled) {
    await logEvent({
      event: "demo_blocked_killswitch",
      locale,
      region,
      variant,
      utm,
      visitorKey: visitor.visitorKey,
      props: { reason: killSwitch.reason },
    });
    return NextResponse.json(
      { code: "demo_unavailable", remaining: 0, used: null, max: null, variant },
      { status: 503 },
    );
  }

  const access = await evaluateDemoAccess(visitor);
  if (!access.allowed) {
    await logEvent({
      event: "demo_limit_reached",
      locale,
      region,
      variant,
      utm,
      visitorKey: visitor.visitorKey,
      props: { reason: access.reason, used: access.used },
    });
    return NextResponse.json(
      { code: access.reason, remaining: 0, used: access.used, max: access.max, variant },
      { status: 429 },
    );
  }

  await logEvent({
    event: "demo_start",
    locale,
    region,
    variant,
    utm,
    visitorKey: visitor.visitorKey,
    props: { used: access.used },
  });

  // Counted at acceptance so repeated failures cannot be used to farm the API.
  await recordDemoAttempt(visitor, { locale, region });

  const result = await generateCaption({ text, locale, region });
  await recordAiSpend(result.costUsd, { model: result.model, locale });

  await logEvent({
    event: "demo_success",
    locale,
    region,
    variant,
    utm,
    visitorKey: visitor.visitorKey,
    props: { source: result.source, latencyMs: result.latencyMs, model: result.model },
  });

  const after = await evaluateDemoAccess(visitor);

  return NextResponse.json({
    caption: result.caption,
    source: result.source,
    latencyMs: result.latencyMs,
    remaining: after.remaining,
    used: after.used,
    max: after.max,
    variant,
  });
}

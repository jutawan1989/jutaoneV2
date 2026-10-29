import { NextResponse, type NextRequest } from "next/server";
import { generateCaption } from "@/lib/ai";
import { getKillSwitchState, recordAiSpend } from "@/lib/ai/budget";
import { logEvent, parseUtm } from "@/lib/analytics/events";
import { resolveVariant } from "@/lib/analytics/variant";
import { sessionOwnerFromHeaders } from "@/lib/auth/member";
import { detectLocale, detectRegion } from "@/lib/geo";
import { isLocale } from "@/lib/i18n/config";
import {
  COPY_FREE_GENERATIONS,
  evaluateDemoAccess,
  recordDemoAttempt,
} from "@/lib/trial/limit";
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
  // Signed-in members use their ledger identity from the session cookie,
  // so their quota is their own — never the anonymous hash of a shared IP.
  // Member generations are unlimited: they pay tokens (dashboard balance),
  // not the free-trial daily quota.
  const sessionOwner = sessionOwnerFromHeaders(headers);
  const memberMode = sessionOwner !== null;
  const quotaKey = memberMode ? sessionOwner : visitor.visitorKey;
  const quotaIdentity = { ...visitor, visitorKey: quotaKey };
  const variant = resolveVariant(quotaKey, request.nextUrl.searchParams.get("variant"));
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

  if (!memberMode) {
    const access = await evaluateDemoAccess(quotaIdentity);
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
        {
          code: access.reason,
          remaining: 0,
          used: access.used,
          max: access.max,
          copyAllowed: false,
          variant,
        },
        { status: 429 },
      );
    }

    await logEvent({
      event: "demo_start",
      locale,
      region,
      variant,
      utm,
      visitorKey: quotaKey,
      props: { used: access.used },
    });

    // Counted at acceptance so repeated failures cannot be used to farm the API.
    await recordDemoAttempt(quotaIdentity, { locale, region });

    const result = await generateCaption({ text, locale, region });
    await recordAiSpend(result.costUsd, { model: result.model, locale });

    await logEvent({
      event: "demo_success",
      locale,
      region,
      variant,
      utm,
      visitorKey: quotaKey,
      props: { source: result.source, latencyMs: result.latencyMs, model: result.model },
    });

    const after = await evaluateDemoAccess(quotaIdentity);

    return NextResponse.json({
      caption: result.caption,
      source: result.source,
      latencyMs: result.latencyMs,
      remaining: after.remaining,
      used: after.used,
      max: after.max,
      // The client must not decide this itself: the lock is a paid feature, so the
      // server states whether this generation's output is copyable.
      // Derived from `after`, not `access`: `access` is the count *before* this
      // attempt was recorded, so reading it here made the third generation look
      // like the second and left copy unlocked one generation too long.
      copyAllowed: after.used <= COPY_FREE_GENERATIONS,
      variant,
    });
  }

  await logEvent({
    event: "demo_start",
    locale,
    region,
    variant,
    utm,
    visitorKey: quotaKey,
    props: { used: null, member: true },
  });

  const memberResult = await generateCaption({ text, locale, region });
  await recordAiSpend(memberResult.costUsd, { model: memberResult.model, locale });

  await logEvent({
    event: "demo_success",
    locale,
    region,
    variant,
    utm,
    visitorKey: quotaKey,
    props: { source: memberResult.source, latencyMs: memberResult.latencyMs, model: memberResult.model, member: true },
  });

  return NextResponse.json({
    caption: memberResult.caption,
    source: memberResult.source,
    latencyMs: memberResult.latencyMs,
    remaining: null,
    used: null,
    max: null,
    copyAllowed: true,
    member: true,
    variant,
  });
}

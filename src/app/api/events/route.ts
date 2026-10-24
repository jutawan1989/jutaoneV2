import { NextResponse, type NextRequest } from "next/server";
import { isAnalyticsEvent, logEvent, parseUtm, type UtmParams } from "@/lib/analytics/events";
import { isVariant, resolveVariant } from "@/lib/analytics/variant";
import { detectLocale, detectRegion } from "@/lib/geo";
import { isLocale } from "@/lib/i18n/config";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventBody = {
  event?: unknown;
  locale?: unknown;
  variant?: unknown;
  utm?: unknown;
  props?: unknown;
};

function readUtm(value: unknown): UtmParams {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const utm: UtmParams = {};
  for (const [key, raw] of Object.entries(source)) {
    if (typeof raw === "string" && raw.length > 0) utm[key as keyof UtmParams] = raw.slice(0, 120);
  }
  return utm;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as EventBody | null;
  if (!body || !isAnalyticsEvent(body.event)) {
    return NextResponse.json({ ok: false, code: "unknown_event" }, { status: 400 });
  }

  const headers = request.headers;
  const requested = typeof body.locale === "string" ? body.locale : null;
  const locale = isLocale(requested) ? requested : detectLocale(headers);
  const region = detectRegion(headers);
  const visitor = identifyVisitor(headers);
  const variant = isVariant(body.variant)
    ? body.variant
    : resolveVariant(visitor.visitorKey, request.nextUrl.searchParams.get("variant"));

  const utmFromBody = readUtm(body.utm);
  const utm = Object.keys(utmFromBody).length > 0 ? utmFromBody : parseUtm(request.nextUrl.search);

  await logEvent({
    event: body.event,
    locale,
    region,
    variant,
    utm,
    visitorKey: visitor.visitorKey,
    props: body.props && typeof body.props === "object" ? (body.props as Record<string, unknown>) : {},
  });

  return NextResponse.json({ ok: true });
}

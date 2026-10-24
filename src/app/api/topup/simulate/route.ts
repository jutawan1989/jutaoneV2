import { NextResponse, type NextRequest } from "next/server";
import { logEvent, parseUtm } from "@/lib/analytics/events";
import { isVariant, resolveVariant } from "@/lib/analytics/variant";
import { detectLocale, detectRegion } from "@/lib/geo";
import { isLocale } from "@/lib/i18n/config";
import { chipConfigured } from "@/lib/payment/chip";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sandbox helper: records a simulated `topup_success` so the funnel can be
 * demonstrated end to end before Chip.Asia credentials exist. Disabled as soon
 * as Chip is configured or when running in production.
 */
export async function POST(request: NextRequest) {
  if (chipConfigured() || process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, code: "simulation_disabled" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { locale?: unknown; variant?: unknown; reference?: unknown }
    | null;
  const headers = request.headers;
  const requested = typeof body?.locale === "string" ? body.locale : null;
  const locale = isLocale(requested) ? requested : detectLocale(headers);
  const region = detectRegion(headers);
  const visitor = identifyVisitor(headers);
  const variant = isVariant(body?.variant) ? body.variant : resolveVariant(visitor.visitorKey);

  await logEvent({
    event: "topup_success",
    locale,
    region,
    variant,
    utm: parseUtm(request.nextUrl.search),
    visitorKey: visitor.visitorKey,
    props: { provider: "sandbox", reference: typeof body?.reference === "string" ? body.reference : null },
  });

  return NextResponse.json({ ok: true });
}

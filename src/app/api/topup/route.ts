import { NextResponse, type NextRequest } from "next/server";
import { logEvent, parseUtm } from "@/lib/analytics/events";
import { isVariant, resolveVariant } from "@/lib/analytics/variant";
import { detectLocale, detectRegion } from "@/lib/geo";
import { isLocale } from "@/lib/i18n/config";
import { createTopUpSession } from "@/lib/payment/chip";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TopUpBody = { locale?: unknown; variant?: unknown; amountUsd?: unknown };

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as TopUpBody | null;
  const headers = request.headers;
  const requested = typeof body?.locale === "string" ? body.locale : null;
  const locale = isLocale(requested) ? requested : detectLocale(headers);
  const region = detectRegion(headers);
  const visitor = identifyVisitor(headers);

  const variant = isVariant(body?.variant)
    ? body.variant
    : resolveVariant(visitor.visitorKey, request.nextUrl.searchParams.get("variant"));
  const utm = parseUtm(request.nextUrl.search);

  try {
    const session = await createTopUpSession({
      locale, region, variant, origin: request.nextUrl.origin, amountUsd: body?.amountUsd, ownerRef: visitor.visitorKey,
    });

    await logEvent({
      event: "topup_click", locale, region, variant, utm, visitorKey: visitor.visitorKey,
      props: { mode: session.mode, reference: session.reference, amount: session.price.amount },
    });

    return NextResponse.json({
      mode: session.mode, checkoutUrl: session.checkoutUrl, reference: session.reference,
      amount: session.price.display, usd: session.price.usd, tokens: session.price.tokens,
    });
  } catch (error) {
    console.error("[jutaone] top-up session failed", error);
    return NextResponse.json({ code: "topup_unavailable" }, { status: 502 });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { logEvent, parseUtm } from "@/lib/analytics/events";
import { isVariant, resolveVariant } from "@/lib/analytics/variant";
import { getFxRates } from "@/lib/fx";
import { detectLocale, detectRegion } from "@/lib/geo";
import { isLocale } from "@/lib/i18n/config";
import { createTopUpSession } from "@/lib/payment/chip";
import { parseTopUpUsdCents } from "@/lib/pricing";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TopUpBody = { locale?: unknown; variant?: unknown; amount_usd?: unknown };

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

  // The client may propose an amount, but the server decides what it means:
  // the token grant is recomputed from the parsed cents, never read from the
  // request body. Absent amount keeps the single-unit base price.
  const parsedAmount = parseTopUpUsdCents(body?.amount_usd ?? 1);
  if (!parsedAmount.ok) {
    return NextResponse.json(
      { code: parsedAmount.code, min: 1, max: 500 },
      { status: 400 },
    );
  }

  try {
    const rates = await getFxRates();
    const session = await createTopUpSession({
      locale,
      region,
      variant,
      origin: request.nextUrl.origin,
      rates,
      usdCents: parsedAmount.usdCents,
    });

    await logEvent({
      event: "topup_click",
      locale,
      region,
      variant,
      utm,
      visitorKey: visitor.visitorKey,
      props: {
        mode: session.mode,
        reference: session.reference,
        amount: session.price.amount,
        currency: session.price.currency,
        base_usd_cents: session.price.baseUsdCents,
        fx_rate: session.price.fxRate,
        fx_source: session.price.fxSource,
        tokens: session.price.tokens,
      },
    });

    return NextResponse.json({
      mode: session.mode,
      checkoutUrl: session.checkoutUrl,
      reference: session.reference,
      amount: session.price.display,
      basePrice: session.price.baseDisplay,
      currency: session.price.currency,
      tokens: session.price.tokens,
    });
  } catch (error) {
    console.error("[jutaone] top-up session failed", error);
    return NextResponse.json({ code: "topup_unavailable" }, { status: 502 });
  }
}

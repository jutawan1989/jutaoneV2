import { NextResponse, type NextRequest } from "next/server";
import { logEvent, parseUtm } from "@/lib/analytics/events";
import { isVariant, resolveVariant } from "@/lib/analytics/variant";
import { detectLocale, detectRegion } from "@/lib/geo";
import { isLocale } from "@/lib/i18n/config";
import { createTopUpSession, InvalidCustomerEmailError } from "@/lib/payment/chip";
import {
  createToyyibBill,
  InvalidToyyibEmailError,
} from "@/lib/payment/toyyibpay";
import { sessionOwnerFromHeaders } from "@/lib/auth/member";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TopUpBody = {
  locale?: unknown;
  variant?: unknown;
  amountUsd?: unknown;
  email?: unknown;
  name?: unknown;
};

/**
 * Dual-gateway top-up entry point.
 *
 * Smart routing (Boss + Linda): Malaysia pays via ToyyibPay (FPX +
 * DuitNow QR, RM1.00 fee inside the bill); Indonesia and the rest of the
 * world stay on Chip.Asia (cards + cross-border QR). The response names
 * the gateway and carries the fee breakdown so the UI can show
 * "RM4.70 + RM1.00 = RM5.70" only for ToyyibPay.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as TopUpBody | null;
  const headers = request.headers;
  const requested = typeof body?.locale === "string" ? body.locale : null;
  const locale = isLocale(requested) ? requested : detectLocale(headers);
  const region = detectRegion(headers);
  // Ledger identity: a signed-in member's `owner_ref` (the same key the
  // dashboard sums) wins; anonymous buyers fall back to the visitor hash.
  // Sending the visitor hash for a logged-in member credits a stranger's
  // key — the REAL bug behind the approved-but-uncredited ToyyibPay sandbox
  // payment (TP2610302248159272, owner=ef4c35cba).
  const visitor = identifyVisitor(headers);
  const ownerRef = sessionOwnerFromHeaders(headers) ?? visitor.visitorKey;

  const variant = isVariant(body?.variant)
    ? body.variant
    : resolveVariant(visitor.visitorKey, request.nextUrl.searchParams.get("variant"));
  const utm = parseUtm(request.nextUrl.search);

  try {
    if (region === "MY") {
      const bill = await createToyyibBill({
        locale,
        region,
        variant,
        origin: request.nextUrl.origin,
        amountUsd: body?.amountUsd,
        ownerRef,
        customerEmail: body?.email,
        customerName: body?.name,
      });

      await logEvent({
        event: "topup_click",
        locale,
        region,
        variant,
        utm,
        visitorKey: visitor.visitorKey,
        props: {
          mode: bill.mode,
          provider: "toyyibpay",
          reference: bill.reference,
          amount: bill.totalSen / 100,
        },
      });

      return NextResponse.json({
        mode: bill.mode,
        provider: "toyyibpay",
        checkoutUrl: bill.checkoutUrl,
        reference: bill.reference,
        amount: bill.price.display,
        usd: bill.price.usd,
        tokens: bill.price.tokens,
        // Fee breakdown for the "RM4.70 + RM1.00 = RM5.70" line.
        baseSen: bill.baseSen,
        feeSen: bill.feeSen,
        totalSen: bill.totalSen,
        paymentLabel: "FPX / DuitNow QR (ToyyibPay)",
      });
    }

    const session = await createTopUpSession({
      locale,
      region,
      variant,
      origin: request.nextUrl.origin,
      amountUsd: body?.amountUsd,
      ownerRef,
      customerEmail: body?.email,
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
        provider: "chip",
        reference: session.reference,
        amount: session.price.amount,
      },
    });

    return NextResponse.json({
      mode: session.mode,
      provider: "chip",
      checkoutUrl: session.checkoutUrl,
      reference: session.reference,
      amount: session.price.display,
      usd: session.price.usd,
      tokens: session.price.tokens,
      paymentLabel: "Credit Card / DuitNow QR (Chip.Asia)",
    });
  } catch (error) {
    if (error instanceof InvalidCustomerEmailError || error instanceof InvalidToyyibEmailError) {
      return NextResponse.json({ code: "invalid_email" }, { status: 400 });
    }
    console.error("[jutaone] top-up session failed", error);
    return NextResponse.json({ code: "topup_unavailable" }, { status: 502 });
  }
}

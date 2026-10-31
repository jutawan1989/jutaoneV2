import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook callback — CLOSED by CTO directive.
 *
 * Curlec (`/api/topup/curlec-callback`) is the single crediting webhook.
 * Every Stripe event is refused with 410 so no historical Stripe session
 * can ever mint tokens.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json({ ok: false, code: "stripe_closed" }, { status: 410 });
}

import { NextResponse, type NextRequest } from "next/server";
import { activateRentWithTokens } from "@/lib/subscription";
import { STORE_RENT_TOKENS } from "@/lib/tokens";
import { sessionOwnerFromHeaders } from "@/lib/auth/member";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Store Rent paid in tokens (CTO spec): 5,000,000 Token = 30 hari.
 *
 * Identity: signed-in member (`owner_ref` from session cookie) wins, anonymous
 * merchant falls back to the header-derived visitor hash — the same rule every
 * metered route uses, so the dashboard balance and the charge read one ledger.
 */
export async function POST(request: NextRequest) {
  const visitor = identifyVisitor(request.headers);
  const ownerRef = sessionOwnerFromHeaders(request.headers) ?? visitor.visitorKey;
  if (!ownerRef) {
    return NextResponse.json({ ok: false, code: "no_identity" }, { status: 400 });
  }

  const result = await activateRentWithTokens(ownerRef);

  if (!result.ok) {
    if (result.reason === "insufficient") {
      return NextResponse.json(
        {
          ok: false,
          code: "insufficient_tokens",
          required: STORE_RENT_TOKENS,
          balance: result.balance ?? 0,
          message: "Baki tidak cukup. Top-Up Token untuk aktifkan kedai.",
        },
        { status: 402 },
      );
    }
    return NextResponse.json(
      { ok: false, code: "rent_failed", reason: result.reason },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    required: STORE_RENT_TOKENS,
    balanceAfter: result.balanceAfter,
    paidUntil: result.subscription.paidUntil,
    extended: result.extended,
    status: result.subscription.status,
    isOpen: result.subscription.isOpen,
  });
}

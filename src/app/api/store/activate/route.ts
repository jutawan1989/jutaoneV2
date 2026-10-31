import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/member";
import { STORE_RENT_DAYS, STORE_RENT_TOKENS, activateStoreRent } from "@/lib/rent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/store/activate — Store Rent paid in tokens (CTO spec).
 *
 * Protected by the signed `jo_session` cookie: anonymous callers get 401
 * `login_required`, never a charge against a wrong identity. Balance checked
 * before charging: < 5,000,000 Token returns 402 `insufficient_tokens`
 * (\"Sila Top-Up\"). Success deducts 5,000,000 Token (reason 'spend') and sets
 * store_subscriptions status='active', paid_until = now + 30 hari.
 */
export async function POST(request: NextRequest) {
  const header = request.headers.get("cookie") ?? "";
  const ownerRef = verifySession(readCookie(header, SESSION_COOKIE) ?? undefined);
  if (!ownerRef) {
    return NextResponse.json({ code: "login_required" }, { status: 401 });
  }

  const result = await activateStoreRent(ownerRef);

  if (!result.ok) {
    if (result.reason === "insufficient") {
      return NextResponse.json(
        {
          ok: false,
          code: "insufficient_tokens",
          required: STORE_RENT_TOKENS,
          days: STORE_RENT_DAYS,
          balance: result.balance ?? 0,
          message: "Baki tidak cukup. Sila Top-Up Token.",
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
    days: STORE_RENT_DAYS,
    balanceAfter: result.balanceAfter,
    paidUntil: result.subscription.paidUntil,
    extended: result.extended,
    status: result.subscription.status,
    isOpen: result.subscription.isOpen,
  });
}

function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

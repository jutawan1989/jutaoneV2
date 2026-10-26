import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabase } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Manual payouts, so a small threshold keeps Boss from processing RM0.47. */
const MIN_PAYOUT_MINOR = 1000;

/**
 * Member requests a payout of their available affiliate balance.
 *
 * The amount is not trusted from the client: the requested figure is clamped to
 * what the database says is available, and `jutaone_guard_payout_request` refuses
 * anything above `unpaid - already reserved`. A member cannot ask for money that
 * is not theirs, even if the request body says otherwise.
 */
export async function POST(request: NextRequest) {
  const jar = await cookies();
  const ownerRef = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!ownerRef) return NextResponse.json({ code: "unauthorised" }, { status: 401 });

  const db = getSupabase();
  if (!db) return NextResponse.json({ code: "store_unavailable" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { amount_minor?: unknown } | null;
  void body;

  const { data: codeRow } = await db
    .from("referral_codes")
    .select("id")
    .eq("owner_ref", ownerRef)
    .maybeSingle();
  if (!codeRow) return NextResponse.json({ code: "no_referral_code" }, { status: 400 });

  const { data: balance } = await db
    .from("affiliate_balances")
    .select("available_minor, currency")
    .eq("referral_code_id", codeRow.id)
    .limit(1)
    .maybeSingle();

  const available = Number(balance?.available_minor ?? 0);
  const currency = (balance?.currency as string | undefined) ?? "MYR";

  if (available <= 0) {
    return NextResponse.json({ code: "nothing_available" }, { status: 400 });
  }
  if (available < MIN_PAYOUT_MINOR) {
    return NextResponse.json(
      { code: "below_minimum", minimumMinor: MIN_PAYOUT_MINOR },
      { status: 400 },
    );
  }

  const { error } = await db.from("payout_requests").insert({
    referral_code_id: codeRow.id,
    currency,
    // The server decides the amount: the client cannot request more than it has.
    amount_minor: available,
    status: "requested",
  });

  if (error) {
    console.error("[jutaone] payout request failed", error.message);
    return NextResponse.json({ code: "request_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, amountMinor: available, currency });
}

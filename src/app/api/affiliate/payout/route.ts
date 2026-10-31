import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabase } from "@/lib/db";
import { ADMIN_FEE_MINOR, MIN_PAYOUT_MINOR, REDEEM_MINOR } from "@/lib/affiliate";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Withdrawal rules (Boss spec, 100% USD — redeem $5.00 + $2.00 admin fee).
 *
 * Fixed split, integer cents end to end: the account must hold at least
 * $7.00 (MIN_PAYOUT_MINOR = 700c). Below that the route refuses with
 * `insufficient_balance` and the Malay message the dashboard shows.
 *
 * Bank details are mandatory (Boss spec): the admin pays out manually and
 * needs the destination. The client amount is ignored entirely — the server
 * decides the fixed 500/200 split from the database balance, so a member
 * cannot request more than they have or pick their own amounts.
 */
type PayoutBody = {
  amount_minor?: unknown;
  bank_name?: unknown;
  account_no?: unknown;
  account_holder?: unknown;
};

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

  const body = (await request.json().catch(() => null)) as PayoutBody | null;

  // Bank details are mandatory (Boss spec): the admin pays out manually and
  // needs the destination. There is no bank column on `payout_requests` yet,
  // so they ride the server log with the request until the backend migration
  // adds persistent columns — the insert below is unchanged on purpose.
  const bankName = typeof body?.bank_name === "string" ? body.bank_name.trim() : "";
  const accountNo = typeof body?.account_no === "string" ? body.account_no.trim() : "";
  const accountHolder = typeof body?.account_holder === "string" ? body.account_holder.trim() : "";
  if (!bankName || !accountNo || !accountHolder) {
    return NextResponse.json({ code: "missing_bank_details" }, { status: 400 });
  }

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

  if (available < MIN_PAYOUT_MINOR) {
    return NextResponse.json(
      {
        code: "insufficient_balance",
        message: "Baki tidak mencukupi untuk penebusan (minimum $7.00 termasuk caj admin).",
        requiredMinor: MIN_PAYOUT_MINOR,
        availableMinor: Number.isSafeInteger(available) ? available : 0,
        currency: "USD",
      },
      { status: 400 },
    );
  }

  const { error } = await db.from("payout_requests").insert({
    referral_code_id: codeRow.id,
    currency: "USD",
    // Fixed Boss split: redeem 500c + admin fee 200c. The net bank transfer
    // equals the redeem (500c) — the fee is charged on top, not deducted.
    amount_minor: REDEEM_MINOR,
    fee_minor: ADMIN_FEE_MINOR,
    net_minor: REDEEM_MINOR,
    status: "pending",
  });

  if (error) {
    console.error("[jutaone] payout request failed", error.message);
    return NextResponse.json({ code: "request_failed" }, { status: 500 });
  }
  console.info("[jutaone] payout bank destination", {
    referral_code_id: codeRow.id,
    bank_name: bankName,
    account_no: accountNo,
    account_holder: accountHolder,
  });

  return NextResponse.json({
    ok: true,
    status: "pending",
    payoutMinor: REDEEM_MINOR,
    feeMinor: ADMIN_FEE_MINOR,
    netMinor: REDEEM_MINOR,
    totalDebitMinor: MIN_PAYOUT_MINOR,
    currency: "USD",
  });
}

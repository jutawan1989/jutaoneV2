import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabase } from "@/lib/db";
import { findMember } from "@/lib/auth/member";
import { ADMIN_COOKIE, authorisedByHeader, verifySession } from "@/lib/admin/auth";
import { parseAddTokensInput } from "@/lib/admin/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manual token credit for testing/support.
 *
 * Guarded by the same admin session as the money dashboard (signed cookie,
 * or `ADMIN_TEST_PASSWORD` via bearer/header for curl). No anonymous or
 * member session may reach this: the ledger insert below uses the service
 * role, so authentication happens here, not in RLS.
 *
 * Flow: email -> `members.owner_ref` -> one `token_ledger` row with
 * reason `admin_manual_topup`. The member dashboard sums the ledger, so a
 * successful insert is visible there on next load — no second write needed.
 * Negative adjustments are refused: to correct an over-credit, spend does
 * not belong on this route; reverse it with a documented follow-up credit.
 */
export async function POST(request: NextRequest) {
  const jar = await cookies();
  const authed =
    verifySession(jar.get(ADMIN_COOKIE)?.value) || authorisedByHeader(request.headers);
  if (!authed) return NextResponse.json({ code: "unauthorised" }, { status: 401 });

  const parsed = parseAddTokensInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ code: parsed.code }, { status: 400 });

  if (!getSupabase()) return NextResponse.json({ code: "store_unavailable" }, { status: 503 });

  // The auth member lookup needs the db too; reuse it so the email check and
  // the "not found" answer stay identical to the login path.
  const found = await findMember(parsed.email);
  if (!found.ok) {
    const code = found.reason === "not_found" ? "member_not_found" : "store_unavailable";
    return NextResponse.json({ code }, { status: found.reason === "not_found" ? 404 : 503 });
  }

  const db = getSupabase();
  if (!db) return NextResponse.json({ code: "store_unavailable" }, { status: 503 });

  const { error } = await db.from("token_ledger").insert({
    visitor_key: found.member.ownerRef,
    delta: parsed.amount,
    reason: "admin_manual_topup",
    tokens: parsed.amount,
  });
  if (error) {
    console.error("[jutaone] admin manual topup failed", error.message);
    return NextResponse.json({ code: "credit_failed" }, { status: 500 });
  }

  // Balance-after uses the same sum-the-ledger read as the dashboard, so the
  // number returned here matches what the member will see.
  const { data: rows } = await db
    .from("token_ledger")
    .select("delta")
    .eq("visitor_key", found.member.ownerRef);
  const balanceAfter = (rows ?? []).reduce((sum, row) => sum + Number(row.delta ?? 0), 0);

  return NextResponse.json({ ok: true, email: found.member.email, credited: parsed.amount, balanceAfter });
}

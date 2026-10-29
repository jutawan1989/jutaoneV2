import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensureAffiliateCode } from "@/lib/affiliate";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ensures the signed-in member has a referral code, minting one on first use.
 *
 * Ali's dashboard calls this when the Affiliate tab opens and the overview
 * carries no code yet. Idempotent: a member who already has a code gets the
 * same code back, so the call is safe to repeat on every tab open.
 */
export async function POST() {
  const jar = await cookies();
  const ownerRef = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!ownerRef) return NextResponse.json({ code: "login_required" }, { status: 401 });

  const code = await ensureAffiliateCode(ownerRef);
  if (!code) return NextResponse.json({ code: "store_unavailable" }, { status: 503 });

  return NextResponse.json({ ok: true, code });
}

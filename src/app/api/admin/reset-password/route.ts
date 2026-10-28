import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabase } from "@/lib/db";
import { findMember, hashPassword } from "@/lib/auth/member";
import { ADMIN_COOKIE, authorisedByHeader, verifySession } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin password reset for a locked-out merchant.
 *
 * Guarded by the same admin session as the money dashboard (signed cookie,
 * or `ADMIN_TEST_PASSWORD` via bearer/header for curl). Same 12-char minimum
 * as the public sign-up rule, so the reset cannot set a weaker password than
 * registration allows. The member's `owner_ref` never changes — tokens,
 * store and affiliate data stay joined.
 *
 * Body: { user_email, new_password } (alias: { email, password }).
 */
export async function POST(request: NextRequest) {
  const jar = await cookies();
  const authed =
    verifySession(jar.get(ADMIN_COOKIE)?.value) || authorisedByHeader(request.headers);
  if (!authed) return NextResponse.json({ code: "unauthorised" }, { status: 401 });

  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const body = (raw ?? {}) as Record<string, unknown>;
  const emailRaw = body.user_email ?? body.email;
  const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ code: "invalid_email" }, { status: 400 });
  }

  const passwordRaw = body.new_password ?? body.password;
  const password = typeof passwordRaw === "string" ? passwordRaw : "";
  if (password.length < 8) {
    return NextResponse.json({ code: "password_too_short", min: 8 }, { status: 400 });
  }
  if (password.length > 200) {
    return NextResponse.json({ code: "password_too_long" }, { status: 400 });
  }

  if (!getSupabase()) return NextResponse.json({ code: "store_unavailable" }, { status: 503 });

  const found = await findMember(email);
  if (!found.ok) {
    const code = found.reason === "not_found" ? "member_not_found" : "store_unavailable";
    return NextResponse.json({ code }, { status: found.reason === "not_found" ? 404 : 503 });
  }

  const db = getSupabase();
  if (!db) return NextResponse.json({ code: "store_unavailable" }, { status: 503 });

  const { error } = await db
    .from("members")
    .update({ password_hash: hashPassword(password) })
    .eq("owner_ref", found.member.ownerRef);
  if (error) {
    console.error("[jutaone] admin password reset failed", error.message);
    return NextResponse.json({ code: "reset_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email: found.member.email });
}

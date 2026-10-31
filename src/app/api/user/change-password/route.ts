import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabase } from "@/lib/db";
import {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  verifySession,
} from "@/lib/auth/member";
import { PASSWORD_MIN, validatePasswordChange } from "@/lib/user-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/user/change-password — tukar kata laluan.
 *
 * Password lama disahkan dahulu dengan hash scrypt yang sedia ada; tanpa
 * padanan, password baharu tidak ditulis. Dilindungi `jo_session`.
 *
 * Body: { currentPassword, newPassword, confirmPassword? }
 * (terima juga snake_case / oldPassword sebagai alias.)
 */
export async function POST(request: NextRequest) {
  const jar = await cookies();
  const ownerRef = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!ownerRef) return NextResponse.json({ code: "unauthorised" }, { status: 401 });

  const db = getSupabase();
  if (!db) return NextResponse.json({ code: "store_unavailable" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ code: "bad_request" }, { status: 400 });

  const checked = validatePasswordChange({
    currentPassword:
      body.currentPassword ??
      body.current_password ??
      body.oldPassword ??
      body.old_password,
    newPassword: body.newPassword ?? body.new_password,
    confirmPassword:
      body.confirmPassword ?? body.confirm_password ?? body.confirm,
  });
  if (!checked.ok) {
    const payload =
      checked.code === "password_too_short"
        ? { code: checked.code, min: PASSWORD_MIN }
        : { code: checked.code };
    return NextResponse.json(payload, { status: 400 });
  }

  const { data, error } = await db
    .from("members")
    .select("password_hash")
    .eq("owner_ref", ownerRef)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ code: "not_found" }, { status: 404 });

  if (!verifyPassword(checked.currentPassword, data.password_hash as string)) {
    // Gagalkan perlahan seperti login: melambatkan tekaan brute-force.
    await new Promise((resolve) => setTimeout(resolve, 300));
    return NextResponse.json({ code: "current_password_wrong" }, { status: 401 });
  }

  const updated = await db
    .from("members")
    .update({ password_hash: hashPassword(checked.newPassword) })
    .eq("owner_ref", ownerRef);
  if (updated.error) {
    console.error("[jutaone] password change failed", updated.error.message);
    return NextResponse.json({ code: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

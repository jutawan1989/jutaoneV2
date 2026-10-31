import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabase } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/member";
import { normalizeDisplayName } from "@/lib/user-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUT /api/user/profile — kemas kini Nama Penuh.
 *
 * Body: { displayName } (alias: fullName, name). Dilindungi `jo_session`:
 * tanpa cookie sesi yang sah, route ini mengembalikan 401 sebelum
 * menyentuh database.
 */
export async function PUT(request: NextRequest) {
  const jar = await cookies();
  const ownerRef = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!ownerRef) return NextResponse.json({ code: "unauthorised" }, { status: 401 });

  const db = getSupabase();
  if (!db) return NextResponse.json({ code: "store_unavailable" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ code: "bad_request" }, { status: 400 });

  const parsed = normalizeDisplayName(body.displayName ?? body.fullName ?? body.name);
  if (!parsed.ok) return NextResponse.json({ code: parsed.code }, { status: 400 });

  const { error } = await db
    .from("members")
    .update({ display_name: parsed.displayName })
    .eq("owner_ref", ownerRef);
  if (error) {
    console.error("[jutaone] profile update failed", error.message);
    return NextResponse.json({ code: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, displayName: parsed.displayName });
}

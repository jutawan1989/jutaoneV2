import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabase } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/member";
import { normalizeBankDetails } from "@/lib/user-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUT /api/user/bank-details — simpan butiran bank untuk payout manual.
 *
 * Disimpan pada `members.bank_name / account_no / account_holder`
 * (lihat supabase/member-settings.sql). Dilindungi `jo_session`.
 *
 * Body: { bankName, accountNo, accountHolder } (terima juga snake_case).
 */
export async function PUT(request: NextRequest) {
  const jar = await cookies();
  const ownerRef = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!ownerRef) return NextResponse.json({ code: "unauthorised" }, { status: 401 });

  const db = getSupabase();
  if (!db) return NextResponse.json({ code: "store_unavailable" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ code: "bad_request" }, { status: 400 });

  const parsed = normalizeBankDetails(body);
  if (!parsed.ok) return NextResponse.json({ code: parsed.code }, { status: 400 });

  const { error } = await db
    .from("members")
    .update(parsed.update)
    .eq("owner_ref", ownerRef);
  if (error) {
    // Kolum bank belum wujud (migrasi belum jalan): maklumkan UI seperti
    // route tetapan gabungan, bukan gagal senyap.
    if (/bank_name|account_no|account_holder|column/i.test(error.message)) {
      return NextResponse.json({ ok: true, bank_unsaved: true });
    }
    console.error("[jutaone] bank details save failed", error.message);
    return NextResponse.json({ code: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

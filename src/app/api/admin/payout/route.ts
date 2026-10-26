import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabase } from "@/lib/db";
import { ADMIN_COOKIE, authorisedByHeader, verifySession } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Marks a payout request as paid.
 *
 * The money columns are never written here. `jutaone_settle_payout` consumes
 * approved earnings oldest-first and raises if the amount cannot be fully
 * allocated, so an admin cannot mark paid an amount the balance does not cover.
 * If it raises, nothing changes and the request stays in the queue.
 */
export async function POST(request: NextRequest) {
  const jar = await cookies();
  const authed =
    verifySession(jar.get(ADMIN_COOKIE)?.value) || authorisedByHeader(request.headers);
  if (!authed) return NextResponse.json({ code: "unauthorised" }, { status: 401 });

  const db = getSupabase();
  if (!db) return NextResponse.json({ code: "store_unavailable" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as
    | { id?: unknown; action?: unknown }
    | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ code: "invalid_id" }, { status: 400 });
  }
  if (body?.action !== "paid") {
    return NextResponse.json({ code: "invalid_action" }, { status: 400 });
  }

  const { data: existing } = await db
    .from("payout_requests")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ code: "not_found" }, { status: 404 });
  if (existing.status === "paid") {
    return NextResponse.json({ ok: true, already: true });
  }
  if (existing.status !== "requested" && existing.status !== "approved") {
    return NextResponse.json({ code: "not_payable", status: existing.status }, { status: 409 });
  }

  // Approve then settle: the settle trigger only runs on the transition to paid.
  const { error } = await db
    .from("payout_requests")
    .update({ status: "paid", decided_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[jutaone] payout settle failed", error.message);
    return NextResponse.json({ code: "settle_failed", detail: error.message.slice(0, 160) }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}

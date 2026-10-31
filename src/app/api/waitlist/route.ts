import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { normaliseWaitlistEntry } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Waitlist intake (Boss spec — Ali's website form + Xiana's Make.com).
 *
 * Open door (no secret): the website form posts here directly and Make.com
 * scenarios use it as the catch-all. Name + at least one contact (phone or
 * email); source is tracked so Xiana can attribute campaigns.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const entry = normaliseWaitlistEntry({
    name: body?.name,
    email: body?.email,
    phone: body?.phone,
    source: body?.source,
  });
  if (!entry.ok) {
    return NextResponse.json({ ok: false, code: entry.code }, { status: 400 });
  }

  const db = getSupabase();
  if (!db) return NextResponse.json({ ok: false, code: "store_unavailable" }, { status: 503 });

  const { data, error } = await db
    .from("waitlist")
    .insert({
      name: entry.name,
      email: entry.email,
      phone: entry.phone,
      source: entry.source,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[jutaone] waitlist insert failed", error.message);
    return NextResponse.json({ ok: false, code: "record_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, id: (data as { id?: unknown } | null)?.id ?? null });
}

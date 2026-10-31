import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { normaliseLead, verifyLeadSecret } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta Lead Ads intake (Boss spec — Xiana / Meta / Make.com).
 *
 * Gated door: the shared secret (`LEAD_ADS_SECRET`) rides the
 * `x-lead-secret` header (preferred) or the JSON body `secret` field, and is
 * compared in constant time. A missing or wrong secret is refused with 401/403
 * before anything is validated or written, so outsiders cannot inject fakes.
 *
 * Meta retries a lead on failure: rows are upserted on `meta_lead_id`, so a
 * replay updates `raw` instead of duplicating the prospect.
 */
export async function POST(request: NextRequest) {
  const secretCheck = verifyLeadSecret(request.headers.get("x-lead-secret"), null);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const check = secretCheck.ok ? secretCheck : verifyLeadSecret(null, body?.secret);
  if (!check.ok) {
    const status = check.code === "lead_secret_not_configured" ? 503 : check.code === "forbidden" ? 403 : 401;
    return NextResponse.json({ ok: false, code: check.code }, { status });
  }

  const lead = normaliseLead({
    name: body?.name ?? body?.full_name,
    email: body?.email ?? body?.email_address,
    phone: body?.phone ?? body?.phone_number,
    source: body?.source ?? "meta_lead_ads",
    meta_lead_id: body?.meta_lead_id ?? body?.lead_id ?? body?.id,
    meta_form_id: body?.meta_form_id ?? body?.form_id,
    meta_page_id: body?.meta_page_id ?? body?.page_id,
  });
  if (!lead.ok) {
    return NextResponse.json({ ok: false, code: lead.code }, { status: 400 });
  }

  const db = getSupabase();
  if (!db) return NextResponse.json({ ok: false, code: "store_unavailable" }, { status: 503 });

  const row = {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    meta_lead_id: lead.metaLeadId,
    meta_form_id: lead.metaFormId,
    meta_page_id: lead.metaPageId,
    raw: (body ?? {}) as Record<string, unknown>,
  };

  const { data, error } =
    lead.metaLeadId !== null
      ? await db.from("leads").upsert(row, { onConflict: "meta_lead_id" }).select("id").maybeSingle()
      : await db.from("leads").insert(row).select("id").maybeSingle();

  if (error) {
    console.error("[jutaone] lead insert failed", error.message);
    return NextResponse.json({ ok: false, code: "record_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, id: (data as { id?: unknown } | null)?.id ?? null });
}

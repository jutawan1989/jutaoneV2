import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  company_name?: unknown;
  category?: unknown;
  location?: unknown;
  country?: unknown;
  website?: unknown;
  description?: unknown;
};

/**
 * Saves a live search result into `supplier_directory`.
 *
 * Kept as `source='opendata'` — not `'opencorporates'` — because an Exa result is
 * a web page, not a registry record. It is therefore stored with
 * `verified = false`, so the "Verified" badge cannot appear on a supplier we
 * merely found on the internet.
 *
 * `source_ref` is derived from the website (or the name), so saving the same
 * supplier twice updates it instead of duplicating the directory.
 */
export async function POST(request: NextRequest) {
  const db = getSupabase();
  if (!db) return NextResponse.json({ code: "store_unavailable" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as Body | null;

  const name = typeof body?.company_name === "string" ? body.company_name.trim() : "";
  if (name.length < 1 || name.length > 200) {
    return NextResponse.json({ code: "name_invalid" }, { status: 400 });
  }

  const website = typeof body?.website === "string" && body.website.trim() !== ""
    ? safeUrl(body.website.trim())
    : null;

  const countryRaw = typeof body?.country === "string" ? body.country.trim().toUpperCase() : "";
  // The table constrains this to ISO-3166 alpha-2; anything else would be a
  // constraint error at insert time, so normalise here.
  const country = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : "MY";

  const sourceRef =
    (website ? new URL(website).hostname + new URL(website).pathname : name.toLowerCase())
      .slice(0, 200);

  const { error } = await db.from("supplier_directory").upsert(
    {
      company_name: name,
      category: typeof body?.category === "string" ? body.category.slice(0, 80) : null,
      location: typeof body?.location === "string" ? body.location.slice(0, 120) : null,
      country,
      website,
      contact_info: {},
      source: "opendata",
      source_ref: sourceRef,
      // Never verified: an Exa hit is not an official record.
      verified: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source,source_ref" },
  );

  if (error) {
    console.error("[jutaone] supplier save failed", error.message);
    return NextResponse.json({ code: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, saved: name });
}

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { exaConfigured, searchSuppliers, type SupplierResult } from "@/lib/exa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_QUERY = 3;
const MAX_QUERY = 200;

/**
 * Supplier search for Biz-Match.
 *
 * Live semantic search from Exa, falling back to our own `supplier_directory`
 * when Exa is unavailable or returns nothing. The fallback matters: a supplier
 * page that shows an error because a third-party API is down is worse than one
 * that shows the 25 suppliers we already have.
 *
 * Every result carries `origin`, so the UI can badge live results differently
 * and only offer "save" on the ones that are not already stored.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("q") ?? "";
  const query = raw.replace(/\s+/g, " ").trim();

  if (query.length < MIN_QUERY) {
    return NextResponse.json(
      { code: "query_too_short", min: MIN_QUERY, results: [], source: "none" },
      { status: 400 },
    );
  }
  if (query.length > MAX_QUERY) {
    return NextResponse.json(
      { code: "query_too_long", max: MAX_QUERY, results: [], source: "none" },
      { status: 400 },
    );
  }

  let exaError: string | null = null;

  if (exaConfigured()) {
    try {
      const results = await searchSuppliers(query);
      if (results.length > 0) {
        return NextResponse.json({ ok: true, source: "exa", count: results.length, results });
      }
      // No results is not an error: fall through to the local directory rather
      // than showing an empty page.
      exaError = "exa_returned_no_results";
    } catch (error) {
      exaError = error instanceof Error ? error.message : String(error);
      console.error("[jutaone] Exa search failed, falling back to directory", exaError);
    }
  } else {
    exaError = "exa_not_configured";
  }

  const results = await searchDirectory(query);

  return NextResponse.json({
    ok: true,
    source: "directory",
    count: results.length,
    // Surfaced so a silent degradation is visible in the UI and in logs.
    degraded: exaError,
    results,
  });
}

/** Local fallback over the seeded/imported supplier table. */
async function searchDirectory(query: string): Promise<SupplierResult[]> {
  const db = getSupabase();
  if (!db) return [];

  const { data, error } = await db.rpc("jutaone_search_suppliers", {
    p_query: query,
    p_category: null,
    p_country: null,
    p_limit: 20,
  });

  if (error) {
    console.error("[jutaone] directory fallback failed", error.message);
    return [];
  }

  type Row = {
    id: number;
    company_name: string;
    category: string | null;
    location: string | null;
    country: string;
    website: string | null;
    verified: boolean;
    source: string;
  };

  return ((data ?? []) as Row[]).map((row) => ({
    id: `dir-${row.id}`,
    companyName: row.company_name,
    category: row.category,
    location: row.location,
    country: row.country,
    description: null,
    url: row.website,
    origin: "directory" as const,
    verified: row.verified,
  }));
}

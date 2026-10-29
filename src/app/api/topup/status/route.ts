import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Source of truth for the top-up return page (`?status=success&ref=...`).
 *
 * The gateway return URL is NOT proof of payment — the user lands here before
 * the server webhook (Chip/ToyyibPay callback) arrives. This endpoint checks
 * the `topups` table: only a row with `status = 'paid'` counts as success.
 * Anything else means "still processing" and the UI must not claim any
 * token balance.
 */
export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("ref")?.trim();
  if (!reference) {
    return NextResponse.json({ ok: false, code: "missing_ref" }, { status: 400 });
  }

  const db = getSupabase();
  if (!db) {
    return NextResponse.json({ ok: false, code: "store_unavailable" }, { status: 503 });
  }

  const { data: rows, error } = await db
    .from("topups")
    .select("provider_id, status")
    .eq("reference", reference)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("[jutaone] topup status lookup failed", error);
    return NextResponse.json({ ok: false, code: "lookup_failed" }, { status: 502 });
  }

  const paidRows = (rows ?? []).filter((row) => row.status === "paid");
  const paid = paidRows.length > 0;
  const latestStatus =
    (rows?.[0]?.status as string | undefined) ?? "unknown";

  // Tokens actually credited by the webhook (spend_ref mirrors provider_id
  // in both the Chip and ToyyibPay callbacks, plus the sandbox simulator).
  let tokens = 0;
  if (paid) {
    const spendRefs = paidRows
      .map((row) => row.provider_id as string | null)
      .filter((value): value is string => Boolean(value));
    if (spendRefs.length > 0) {
      const { data: ledger } = await db
        .from("token_ledger")
        .select("delta")
        .in("spend_ref", spendRefs);
      for (const entry of (ledger ?? []) as Array<{ delta: number | string }>) {
        tokens += Number(entry.delta ?? 0);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    reference,
    paid,
    status: paid ? "paid" : latestStatus,
    tokens,
  });
}

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CLOSED by CTO directive (TASK 1): 7-day trial removed.
 * Store Rent is token-only: POST /api/store/activate.
 */
export async function POST() {
  return NextResponse.json({ code: "trial_closed" }, { status: 410 });
}

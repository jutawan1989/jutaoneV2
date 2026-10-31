import { NextResponse, type NextRequest } from "next/server";
import { getSubscription } from "@/lib/subscription";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Store Rent checkout — DISABLED pending the Curlec/Chip Rent path.
 *
 * Stripe is CLOSED by CTO directive, and Rent must never open a Stripe
 * session. The legacy Chip rent callback (`/api/topup/callback` rent
 * branch) is untouched; this checkout endpoint refuses with 410 until the
 * Rent-via-Curlec (or re-enabled Chip purchase) flow is specified.
 */
export async function POST(request: NextRequest) {
  const owner = identifyVisitor(request.headers).visitorKey;

  const existing = await getSubscription(owner);
  if (existing && existing.status === "active" && existing.isOpen) {
    return NextResponse.json({ code: "already_active" }, { status: 409 });
  }

  return NextResponse.json({ code: "stripe_closed" }, { status: 410 });
}

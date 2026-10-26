import { NextResponse, type NextRequest } from "next/server";
import { startTrial } from "@/lib/subscription";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starts the 7-day store trial for the calling merchant.
 *
 * The trial end date is computed on the server. The `owner_ref` comes from the
 * request headers, never from the body, so a caller cannot start a trial for
 * somebody else — and the unique index on `owner_ref` means the clock cannot be
 * restarted by calling this twice.
 */
export async function POST(request: NextRequest) {
  const owner = identifyVisitor(request.headers).visitorKey;

  const result = await startTrial(owner);
  if (!result.ok) {
    const conflict = result.reason === "already_subscribed";
    return NextResponse.json(
      { code: conflict ? "already_subscribed" : "trial_failed" },
      { status: conflict ? 409 : 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: result.subscription.status,
    trialEndsAt: result.subscription.trialEndsAt,
    trialDaysLeft: result.subscription.trialDaysLeft,
  });
}

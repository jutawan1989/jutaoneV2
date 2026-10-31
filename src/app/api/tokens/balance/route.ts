import { NextResponse, type NextRequest } from "next/server";
import { getTokenBalance } from "@/lib/tokens";
import { sessionOwnerFromHeaders } from "@/lib/auth/member";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Current token balance for the caller (member session wins, else visitor key).
 * Used by the /store "Kedai Saya" rent card, which has no member overview.
 */
export async function GET(request: NextRequest) {
  const visitor = identifyVisitor(request.headers);
  const ownerRef = sessionOwnerFromHeaders(request.headers) ?? visitor.visitorKey;
  const balance = await getTokenBalance(ownerRef);
  return NextResponse.json({ ok: true, balance });
}

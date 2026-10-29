import { NextResponse, type NextRequest } from "next/server";
import { generateCaption, type CaptionResult } from "@/lib/ai";
import { recordAiSpend } from "@/lib/ai/budget";
import { logEvent } from "@/lib/analytics/events";
import { resolveVariant } from "@/lib/analytics/variant";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/member";
import { detectLocale, detectRegion } from "@/lib/geo";
import { isLocale } from "@/lib/i18n/config";
import { AD_COST_TOKENS, chargeTokens, getTokenBalance } from "@/lib/tokens";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_CHARS = 5;
const MAX_CHARS = 200;

type AdsBody = { text?: unknown; product?: unknown; locale?: unknown; rid?: unknown };

function badRequest(code: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ code, ...extra }, { status: 400 });
}

function requireOwner(request: NextRequest): { ownerRef: string } | { error: NextResponse } {
  const header = request.headers.get("cookie") ?? "";
  const fromHeader = readCookie(header, SESSION_COOKIE);
  const ownerRef = verifySession(fromHeader ?? undefined);
  if (ownerRef) return { ownerRef };
  return {
    error: NextResponse.json({ code: "login_required" }, { status: 401 }),
  };
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * Paid ad generation for members: 20,000 tokens per caption.
 *
 * Separate from `/api/demo` on purpose: the demo serves the anonymous free
 * trial (quota-limited, never touches the ledger), while this route serves
 * the paid members page (`/dashboard/ads`). Sharing one route would let a
 * client pick the free path for paid work, or vice versa.
 *
 * Order (same money rule as chat + metals):
 *   1. login required (401) — an anonymous visitor has no ledger identity;
 *   2. balance check, refuse early with 402 before any AI call;
 *   3. call the AI caption chain (Groq -> OpenRouter -> Gemini -> OpenAI -> Meta);
 *   4. charge 20,000 tokens ONLY when a caption came back.
 *
 * A failed generation is free. The charge is keyed by a request reference so
 * a retried request cannot charge twice for one caption.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as AdsBody | null;
  const rawText =
    typeof body?.text === "string"
      ? body.text
      : typeof body?.product === "string"
        ? body.product
        : "";
  const text = rawText.replace(/\s+/g, " ").trim();

  if (text.length < MIN_CHARS) return badRequest("text_too_short", { min: MIN_CHARS });
  if (text.length > MAX_CHARS) return badRequest("text_too_long", { max: MAX_CHARS });

  const login = requireOwner(request);
  if ("error" in login) return login.error;
  const ownerRef = login.ownerRef;

  const headers = request.headers;
  const requested = typeof body?.locale === "string" ? body.locale : null;
  const locale = isLocale(requested) ? requested : detectLocale(headers);
  const region = detectRegion(headers);
  const visitor = identifyVisitor(headers);
  const variant = resolveVariant(ownerRef, request.nextUrl.searchParams.get("variant"));

  const reference =
    typeof body?.rid === "string" && body.rid.length > 0
      ? body.rid.slice(0, 64)
      : `ads:${ownerRef.slice(0, 16)}:${Buffer.from(text).toString("base64url").slice(0, 24)}`;

  const balance = await getTokenBalance(ownerRef);
  if (balance < AD_COST_TOKENS) {
    return NextResponse.json(
      {
        code: "insufficient_tokens",
        message: "Baki tidak cukup",
        required: AD_COST_TOKENS,
        balance,
      },
      { status: 402 },
    );
  }

  await logEvent({
    event: "demo_start",
    locale,
    region,
    variant,
    visitorKey: ownerRef,
    props: { surface: "ads" },
  });

  let result: CaptionResult;
  try {
    result = await generateCaption({ text, locale, region });
  } catch (error) {
    // No caption produced: free, never charged.
    console.error("[jutaone] ads generation failed", (error as Error).message);
    return NextResponse.json({ code: "assistant_unavailable" }, { status: 503 });
  }
  if (!result.caption) {
    return NextResponse.json({ code: "assistant_unavailable" }, { status: 503 });
  }

  const charge = await chargeTokens({
    visitorKey: ownerRef,
    cost: AD_COST_TOKENS,
    reference,
    note: `ads:${text.slice(0, 80)}`,
  });

  if (!charge.ok && charge.reason === "insufficient") {
    // Lost the race against a concurrent charge: no caption, no fee.
    return NextResponse.json(
      {
        code: "insufficient_tokens",
        message: "Baki tidak cukup",
        required: AD_COST_TOKENS,
        balance,
      },
      { status: 402 },
    );
  }
  if (!charge.ok) {
    console.error("[jutaone] ads charge failed", charge.reason);
    return NextResponse.json({ code: "charge_failed", caption: result.caption }, { status: 500 });
  }

  await recordAiSpend(result.costUsd, { model: result.model, locale });

  await logEvent({
    event: "demo_success",
    locale,
    region,
    variant,
    visitorKey: ownerRef,
    props: {
      source: result.source,
      latencyMs: result.latencyMs,
      model: result.model,
      visitor: visitor.visitorKey,
    },
  });

  return NextResponse.json({
    ok: true,
    caption: result.caption,
    source: result.source,
    latencyMs: result.latencyMs,
    billing: {
      chargedTokens: charge.charged ? AD_COST_TOKENS : 0,
      balanceAfter: charge.balanceAfter,
      replayed: charge.replayed,
    },
    variant,
  });
}

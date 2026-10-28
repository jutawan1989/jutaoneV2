import { NextResponse, type NextRequest } from "next/server";
import type { CaptionResult } from "@/lib/ai";
import { generateAssistantReply } from "@/lib/ai/assistant";
import { recordAiSpend } from "@/lib/ai/budget";
import { logEvent } from "@/lib/analytics/events";
import { resolveVariant } from "@/lib/analytics/variant";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/member";
import { detectLocale, detectRegion } from "@/lib/geo";
import { isLocale } from "@/lib/i18n/config";
import { CHAT_COST_TOKENS, chargeTokens, getTokenBalance } from "@/lib/tokens";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_CHARS = 2;
const MAX_CHARS = 2000;

type ChatBody = { message?: unknown; locale?: unknown; rid?: unknown };

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
 * Smart Assistant: paid chat for members, 5,000 tokens per answered reply.
 *
 * Prompt (Boss spec): "You are JutaOne Smart Assistant, a helpful business
 * advisor for SMEs in Malaysia and Indonesia. Answer concisely in the user's
 * language." The AI call lives in `lib/ai/assistant.ts` (route files may only
 * export handlers and config).
 *
 * Order (same money rule as Biz-Match):
 *   1. login required (401) — an anonymous visitor has no ledger identity;
 *   2. balance check, refuse early with 402 "Baki tidak cukup" before any AI call;
 *   3. call the AI chain (DeepSeek -> Groq -> OpenAI -> OpenRouter -> Meta);
 *   4. charge 5,000 tokens ONLY when an answer came back.
 *
 * A failed generation is free. The charge is keyed by a request reference so
 * a retried request cannot charge twice for one answer.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as ChatBody | null;
  const rawMessage = typeof body?.message === "string" ? body.message : "";
  const message = rawMessage.replace(/\s+/g, " ").trim();

  if (message.length < MIN_CHARS) return badRequest("message_too_short", { min: MIN_CHARS });
  if (message.length > MAX_CHARS) return badRequest("message_too_long", { max: MAX_CHARS });

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
      : `chat:${ownerRef.slice(0, 16)}:${Buffer.from(message).toString("base64url").slice(0, 24)}`;

  const balance = await getTokenBalance(ownerRef);
  if (balance < CHAT_COST_TOKENS) {
    return NextResponse.json(
      {
        code: "insufficient_tokens",
        message: "Baki tidak cukup",
        required: CHAT_COST_TOKENS,
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
    props: { surface: "chat" },
  });

  let result: CaptionResult;
  try {
    result = await generateAssistantReply({ message, locale, region });
  } catch (error) {
    // No answer produced: free, never charged.
    console.error("[jutaone] smart assistant generation failed", (error as Error).message);
    return NextResponse.json({ code: "assistant_unavailable" }, { status: 503 });
  }
  if (!result.caption) {
    return NextResponse.json({ code: "assistant_unavailable" }, { status: 503 });
  }

  const charge = await chargeTokens({
    visitorKey: ownerRef,
    cost: CHAT_COST_TOKENS,
    reference,
    note: `chat:${message.slice(0, 80)}`,
  });

  if (!charge.ok && charge.reason === "insufficient") {
    // Lost the race against a concurrent charge: no answer, no fee.
    return NextResponse.json(
      {
        code: "insufficient_tokens",
        message: "Baki tidak cukup",
        required: CHAT_COST_TOKENS,
        balance,
      },
      { status: 402 },
    );
  }
  if (!charge.ok) {
    console.error("[jutaone] smart assistant charge failed", charge.reason);
    return NextResponse.json({ code: "charge_failed", answer: result.caption }, { status: 500 });
  }

  await recordAiSpend(result.costUsd, { model: result.model, locale });

  await logEvent({
    event: "chat_success",
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
    answer: result.caption,
    source: result.source,
    latencyMs: result.latencyMs,
    billing: {
      chargedTokens: charge.charged ? CHAT_COST_TOKENS : 0,
      balanceAfter: charge.balanceAfter,
      replayed: charge.replayed,
    },
    variant,
  });
}

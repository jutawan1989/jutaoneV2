import { NextResponse, type NextRequest } from "next/server";
import { generateCaption, type CaptionResult } from "@/lib/ai";
import type { Locale, Region } from "@/lib/i18n/config";
import { normalizeCaption } from "@/lib/ai/caption";
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

/**
 * Boss-spec assistant prompt: business advisor for MY/ID SMEs, concise, in the
 * user's language. The generic caption prompt builders are caption-shaped
 * (hooks, CTAs, hashtags), so the assistant carries its own prompts.
 */
const ASSISTANT_SYSTEM_PROMPT =
  "You are JutaOne Smart Assistant, a helpful business advisor for SMEs in Malaysia and Indonesia. Answer concisely in the user's language.";

function buildAssistantMessages(message: string, locale: Locale): Array<{ role: string; content: string }> {
  const language =
    locale === "ms" ? "Bahasa Melayu" : locale === "id" ? "Bahasa Indonesia" : "English";
  return [
    { role: "system", content: `${ASSISTANT_SYSTEM_PROMPT} Reply in ${language}.` },
    { role: "user", content: message },
  ];
}

/** Short plain-text answer: strip wrappers, keep up to ~1200 chars. */
export function normalizeAssistantAnswer(raw: string): string {
  return normalizeCaption(raw, { maxEmoji: 10, maxChars: 1200 });
}

export type AssistantRequest = { message: string; locale: Locale; region: Region };

export async function generateAssistantReply(req: AssistantRequest): Promise<CaptionResult> {
  const startedAt = Date.now();
  const providers = [
    process.env.DEEPSEEK_API_KEY
      ? { name: "deepseek", base: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com", model: process.env.DEEPSEEK_MODEL || "deepseek-chat", key: process.env.DEEPSEEK_API_KEY }
      : null,
    process.env.GROQ_API_KEY
      ? { name: "groq", base: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1", model: process.env.GROQ_MODEL || "qwen/qwen3.8-27b", key: process.env.GROQ_API_KEY }
      : null,
    process.env.OPENAI_API_KEY
      ? { name: "openai", base: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1", model: process.env.OPENAI_MODEL || "gpt-4o-mini", key: process.env.OPENAI_API_KEY }
      : null,
    process.env.OPENROUTER_API_KEY
      ? { name: "openrouter", base: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1", model: process.env.OPENROUTER_MODEL || "dots-studio/dots-3-note-preview:free", key: process.env.OPENROUTER_API_KEY }
      : null,
    process.env.META_AI_API_KEY
      ? { name: "meta", base: process.env.META_AI_BASE_URL || "https://api.meta.ai/v1", model: process.env.META_AI_MODEL || "muse-spark-1.3", key: process.env.META_AI_API_KEY }
      : null,
  ].filter((p): p is NonNullable<typeof p> => p !== null);

  if (providers.length === 0) {
    return generateCaption({ text: req.message, locale: req.locale, region: req.region });
  }

  const failures: string[] = [];
  for (const provider of providers) {
    try {
      const response = await fetch(`${provider.base.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${provider.key}` },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.7,
          max_tokens: 600,
          messages: buildAssistantMessages(req.message, req.locale),
        }),
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: { total_tokens?: number };
      };
      if (!response.ok) throw new Error(`${provider.name} responded ${response.status}`);
      const answer = normalizeAssistantAnswer(payload.choices?.[0]?.message?.content ?? "");
      if (!answer) throw new Error(`${provider.name} returned an empty answer`);
      return {
        caption: answer,
        source: provider.name as CaptionResult["source"],
        model: provider.model,
        costUsd: 0,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      failures.push(`${provider.name}: ${(error as Error).message}`.slice(0, 160));
    }
  }
  throw new Error(`every assistant provider failed: ${failures.join(" | ")}`);
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
 * language." The generic caption prompt builders are caption-shaped, so the
 * assistant carries its own prompts rather than reusing them.
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

  let result: Awaited<ReturnType<typeof generateCaption>>;
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

export function __testCookieJar(): string {
  // Keeps the session-cookie name referenced in one place.
  return SESSION_COOKIE;
}

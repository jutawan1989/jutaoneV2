import { normalizeCaption } from "./caption";
import { buildSystemPrompt, buildUserPrompt, type CaptionRequest, type CaptionResult } from "./prompt";

/**
 * Groq adapter (OpenAI-compatible chat completions).
 *
 * MEASURED against the key in use:
 *
 *   - `llama-3.1-8b-instant` and `llama-3.3-70b-versatile` — the models the brief
 *     named — are NOT available: `404 The model ... does not exist or you do not
 *     have access to it`. Listing `/models` returns 11 ids and neither is there.
 *   - `openai/gpt-oss-20b` and `gpt-oss-120b` ARE available but are reasoning
 *     models: a 300-token budget was consumed entirely by 298 reasoning tokens
 *     and `content` came back empty with `finish_reason: length`. Same trap as the
 *     free OpenRouter reasoning tiers.
 *   - `qwen/qwen3.8-27b` answers directly in ~120ms with usable Malay.
 *
 * So the default is `qwen/qwen3.8-27b`, and the model stays overridable through
 * GROQ_MODEL for when the account gains access to the Llama tiers.
 */
const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "qwen/qwen3.8-27b";
const DEFAULT_MAX_TOKENS = 400;

export function groqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY) && process.env.GROQ_ENABLED !== "0";
}

function baseUrl(): string {
  return (process.env.GROQ_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function modelName(): string {
  return process.env.GROQ_MODEL || DEFAULT_MODEL;
}

function timeoutMs(): number {
  const raw = Number(process.env.GROQ_TIMEOUT_MS);
  // 8s was too tight: a verbose generation measured past it and the request
  // aborted, so Groq lost to OpenRouter even with a healthy key. This is a
  // per-provider ceiling, not the visitor-facing budget; the chain still falls
  // through, it just gives each provider a realistic chance first.
  return Number.isFinite(raw) && raw > 500 ? raw : 20_000;
}

function maxTokens(): number {
  const raw = Number(process.env.GROQ_MAX_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_TOKENS;
}

type GroqPayload = {
  error?: { message?: string };
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null; reasoning?: string | null };
  }>;
  usage?: {
    total_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

export async function generateWithGroq(req: CaptionRequest): Promise<CaptionResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const model = modelName();
  const startedAt = Date.now();

  const response = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      max_tokens: maxTokens(),
      messages: [
        { role: "system", content: buildSystemPrompt(req.locale, req.region) },
        { role: "user", content: buildUserPrompt(req.text) },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs()),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as GroqPayload;

  if (!response.ok) {
    const detail = payload?.error?.message ?? "";
    throw new Error(`Groq responded ${response.status}: ${detail.slice(0, 200)}`);
  }

  const caption = normalizeCaption(payload.choices?.[0]?.message?.content ?? "");
  if (!caption) {
    // Naming the reasoning-token count makes "empty caption" actionable instead
    // of a dead end: it says the budget went to thinking, not that the key broke.
    const reasoning =
      payload.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    throw new Error(
      `Groq returned no caption (finish=${payload.choices?.[0]?.finish_reason ?? "unknown"}, reasoning_tokens=${reasoning})`,
    );
  }

  // Groq reports tokens, not cost. Rate is configurable so the kill switch keeps
  // working; the free tier is 0 by default.
  const totalTokens = payload.usage?.total_tokens ?? 0;
  const per1k = Number(process.env.GROQ_COST_PER_1K_TOKENS);
  const rate = Number.isFinite(per1k) && per1k >= 0 ? per1k : 0;

  // A `length` finish means the model kept going past the caption. The
  // normaliser allows 400 chars, and a 1200-char essay still passed, so the first
  // paragraph is kept: the site promises one caption, not an article.
  const trimmed =
    payload.choices?.[0]?.finish_reason === "length"
      ? caption.split(/\n\s*\n/)[0].slice(0, 240).trim()
      : caption;

  return {
    caption: trimmed,
    source: "groq",
    model,
    costUsd: totalTokens > 0 ? (totalTokens / 1000) * rate : 0,
    latencyMs: Date.now() - startedAt,
  };
}

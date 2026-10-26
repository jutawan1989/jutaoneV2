import { buildSystemPrompt, buildUserPrompt, type CaptionRequest, type CaptionResult } from "./prompt";
import { normalizeCaption } from "./caption";

/**
 * DeepSeek's platform API is OpenAI-compatible, so the request shape matches
 * the other adapters. Two things are specific:
 *
 * 1. The endpoint is `https://api.deepseek.com` (not `api.deepseek.com/v1`)
 *    for chat completions, and the key format is `sk-...` from
 *    platform.deepseek.com — it is NOT interchangeable with an OpenRouter key.
 * 2. `deepseek-chat` is the non-reasoning model. `deepseek-reasoner` is the
 *    reasoning tier, which would land in the same trap as the free OpenRouter
 *    reasoning models: hundreds of tokens of thinking before any caption, and
 *    a truncated result if the budget is tight. The default here is the
 *    non-reasoning one, and the model stays overridable.
 */
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_MAX_TOKENS = 400;

export function deepSeekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY) && process.env.DEEPSEEK_ENABLED !== "0";
}

function baseUrl(): string {
  return (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function modelName(): string {
  return process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
}

function timeoutMs(): number {
  const raw = Number(process.env.DEEPSEEK_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 500 ? raw : 8000;
}

function maxTokens(): number {
  const raw = Number(process.env.DEEPSEEK_MAX_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_TOKENS;
}

type DeepSeekPayload = {
  error?: { message?: string };
  choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

export async function generateWithDeepSeek(req: CaptionRequest): Promise<CaptionResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");

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

  const payload = (await response.json().catch(() => ({}))) as DeepSeekPayload;

  if (!response.ok) {
    const detail = payload?.error?.message ?? "";
    throw new Error(`DeepSeek responded ${response.status}: ${detail.slice(0, 200)}`);
  }

  const caption = normalizeCaption(payload.choices?.[0]?.message?.content ?? "");
  if (!caption) {
    throw new Error(
      `DeepSeek returned no caption (finish=${payload.choices?.[0]?.finish_reason ?? "unknown"})`,
    );
  }

  // DeepSeek reports tokens, not cost. The per-1K price is configurable so the
  // kill switch keeps working when pricing changes.
  const totalTokens = payload.usage?.total_tokens ?? 0;
  const per1k = Number(process.env.DEEPSEEK_COST_PER_1K_TOKENS);
  const rate = Number.isFinite(per1k) && per1k >= 0 ? per1k : 0.00027;

  return {
    caption,
    source: "deepseek",
    model,
    costUsd: totalTokens > 0 ? (totalTokens / 1000) * rate : 0,
    latencyMs: Date.now() - startedAt,
  };
}

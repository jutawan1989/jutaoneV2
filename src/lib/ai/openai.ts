import { normalizeCaption } from "./caption";
import { buildSystemPrompt, buildUserPrompt, type CaptionRequest, type CaptionResult } from "./prompt";

/**
 * OpenAI adapter (chat completions).
 *
 * Positioned last among the paid providers in the cost-saving chain: Groq
 * primary, OpenRouter free, Gemini, then gpt-4o-mini as the reliable tier
 * before the local template. Same prompt builders as every other adapter, so
 * BM/ID/EN rules, the 3-emoji cap and the compliance preamble are identical.
 */
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_TOKENS = 400;

export function openAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY) && process.env.OPENAI_ENABLED !== "0";
}

function baseUrl(): string {
  return (process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function modelName(): string {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

function timeoutMs(): number {
  const raw = Number(process.env.OPENAI_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 500 ? raw : 20_000;
}

function maxTokens(): number {
  const raw = Number(process.env.OPENAI_MAX_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_TOKENS;
}

type OpenAIPayload = {
  error?: { message?: string };
  choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }>;
  usage?: { total_tokens?: number };
};

export async function generateWithOpenAI(req: CaptionRequest): Promise<CaptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const model = modelName();
  const startedAt = Date.now();

  const response = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + apiKey,
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

  const payload = (await response.json().catch(() => ({}))) as OpenAIPayload;

  if (!response.ok) {
    const detail = payload?.error?.message ?? "";
    throw new Error(`OpenAI responded ${response.status}: ${detail.slice(0, 200)}`);
  }

  const caption = normalizeCaption(payload.choices?.[0]?.message?.content ?? "");
  if (!caption) {
    throw new Error(
      `OpenAI returned no caption (finish=${payload.choices?.[0]?.finish_reason ?? "unknown"})`,
    );
  }

  // gpt-4o-mini list pricing: $0.15/1M input + $0.60/1M output blended here as
  // $0.30/1K total tokens, overridable. The kill switch only needs an honest
  // order of magnitude.
  const totalTokens = payload.usage?.total_tokens ?? 0;
  const per1k = Number(process.env.OPENAI_COST_PER_1K_TOKENS);
  const rate = Number.isFinite(per1k) && per1k >= 0 ? per1k : 0.00045;
  const costUsd = totalTokens > 0 ? (totalTokens / 1000) * rate : 0.00045;

  return {
    caption,
    source: "openai",
    model,
    costUsd,
    latencyMs: Date.now() - startedAt,
  };
}

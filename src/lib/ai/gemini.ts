import { normalizeCaption } from "./caption";
import { buildSystemPrompt, buildUserPrompt, type CaptionRequest, type CaptionResult } from "./prompt";

/**
 * Gemini adapter (OpenAI-compatible chat completions endpoint).
 *
 * Cost strategy (Boss): Groq primary, OpenRouter free, Gemini, then OpenAI.
 * Google exposes an OpenAI-compatible endpoint at
 * `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
 * so the request shape matches the other adapters and only the base URL,
 * default model and env names are Gemini-specific.
 *
 * Defaults: `gemini-2.0-flash` (fast, cheap, non-reasoning). The model stays
 * overridable through GEMINI_MODEL.
 */
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_MODEL = "gemini-2.0-flash";
const DEFAULT_MAX_TOKENS = 400;

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY) && process.env.GEMINI_ENABLED !== "0";
}

function baseUrl(): string {
  return (process.env.GEMINI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function modelName(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

function timeoutMs(): number {
  const raw = Number(process.env.GEMINI_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 500 ? raw : 20_000;
}

function maxTokens(): number {
  const raw = Number(process.env.GEMINI_MAX_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_TOKENS;
}

type GeminiPayload = {
  error?: { message?: string };
  choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }>;
  usage?: { total_tokens?: number };
};

export async function generateWithGemini(req: CaptionRequest): Promise<CaptionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

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

  const payload = (await response.json().catch(() => ({}))) as GeminiPayload;

  if (!response.ok) {
    const detail = payload?.error?.message ?? "";
    throw new Error(`Gemini responded ${response.status}: ${detail.slice(0, 200)}`);
  }

  const caption = normalizeCaption(payload.choices?.[0]?.message?.content ?? "");
  if (!caption) {
    throw new Error(
      `Gemini returned no caption (finish=${payload.choices?.[0]?.finish_reason ?? "unknown"})`,
    );
  }

  // Gemini 2.0 Flash list pricing is ~$0.10/1M in + $0.40/1M out; blended here
  // as $0.30/1K total tokens, overridable. The kill switch only needs an honest
  // order of magnitude.
  const totalTokens = payload.usage?.total_tokens ?? 0;
  const per1k = Number(process.env.GEMINI_COST_PER_1K_TOKENS);
  const rate = Number.isFinite(per1k) && per1k >= 0 ? per1k : 0.0003;
  const costUsd = totalTokens > 0 ? (totalTokens / 1000) * rate : 0.0003;

  return {
    caption,
    source: "gemini",
    model,
    costUsd,
    latencyMs: Date.now() - startedAt,
  };
}

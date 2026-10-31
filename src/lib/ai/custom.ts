import { normalizeCaption } from "./caption";
import { buildSystemPrompt, buildUserPrompt, type CaptionRequest, type CaptionResult } from "./prompt";

/**
 * Top-Tools-Ai adapter (CTO directive, OpenAI-compatible).
 *
 * Vendor baharu yang belum teruji: diletak sebagai Fallback pertama selepas
 * Groq/OpenRouter dalam rantaian kos (bukan Primary), supaya kegagalannya
 * jatuh ke Gemini/OpenAI/Meta/template tanpa menjejaskan pengguna.
 * Model lalai `Top-Tools-Ai`, boleh ubah melalui CUSTOM_AI_MODEL.
 */
const DEFAULT_BASE_URL = "https://top-tools-ai.com/api/v1";
const DEFAULT_MODEL = "Top-Tools-Ai";
const DEFAULT_MAX_TOKENS = 400;

export function customAIConfigured(): boolean {
  return Boolean(process.env.CUSTOM_AI_API_KEY) && process.env.CUSTOM_AI_ENABLED !== "0";
}

function baseUrl(): string {
  return (process.env.CUSTOM_AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function modelName(): string {
  return process.env.CUSTOM_AI_MODEL || DEFAULT_MODEL;
}

function timeoutMs(): number {
  const raw = Number(process.env.CUSTOM_AI_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 500 ? raw : 20_000;
}

function maxTokens(): number {
  const raw = Number(process.env.CUSTOM_AI_MAX_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_TOKENS;
}

type CustomAIPayload = {
  error?: { message?: string };
  choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }>;
  usage?: { total_tokens?: number };
};

export async function generateWithCustomAI(req: CaptionRequest): Promise<CaptionResult> {
  const apiKey = process.env.CUSTOM_AI_API_KEY;
  if (!apiKey) throw new Error("CUSTOM_AI_API_KEY is not configured");

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

  const payload = (await response.json().catch(() => ({}))) as CustomAIPayload;

  if (!response.ok) {
    const detail = payload?.error?.message ?? "";
    throw new Error(`Top-Tools-Ai responded ${response.status}: ${detail.slice(0, 200)}`);
  }

  const caption = normalizeCaption(payload.choices?.[0]?.message?.content ?? "");
  if (!caption) {
    throw new Error(
      `Top-Tools-Ai returned no caption (finish=${payload.choices?.[0]?.finish_reason ?? "unknown"})`,
    );
  }

  const totalTokens = payload.usage?.total_tokens ?? 0;
  const per1k = Number(process.env.CUSTOM_AI_COST_PER_1K_TOKENS);
  const rate = Number.isFinite(per1k) && per1k >= 0 ? per1k : 0;
  const costUsd = totalTokens > 0 ? (totalTokens / 1000) * rate : 0;

  return {
    caption,
    source: "custom",
    model,
    costUsd,
    latencyMs: Date.now() - startedAt,
  };
}

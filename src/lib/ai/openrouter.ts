import { buildSystemPrompt, buildUserPrompt, type CaptionRequest, type CaptionResult } from "./prompt";

/**
 * OpenRouter is OpenAI-compatible, so the request shape is the same as Meta's.
 *
 * Two things are specific to the free tier in use:
 *
 * 1. `recursive/flint-v1.0:free` is a reasoning model and reasoning is
 *    mandatory ("Reasoning is mandatory for this endpoint and cannot be
 *    disabled"). It spends 650-1330 completion tokens thinking before it
 *    writes anything, and `reasoning.effort` / `reasoning.max_tokens` are
 *    accepted but ignored. With a budget under ~1500 tokens the response comes
 *    back with `finish_reason: "length"` and `content: null`, so the budget
 *    here has to be generous — capping output tokens to make it faster is not
 *    possible on this model.
 * 2. That makes a real caption cost roughly 9-14 seconds. The caller's timeout
 *    must therefore be far higher than the Meta path's; a Meta-sized timeout
 *    would fall back to the local template on every single request.
 */
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "recursive/flint-v1.0:free";
/** Measured worst case (1330 reasoning tokens) plus room for a 240-char caption. */
const DEFAULT_MAX_TOKENS = 2000;

export function openRouterConfigured(): boolean {
  // Explicitly switchable so staging can drop back to the local template
  // without removing the key.
  return Boolean(process.env.OPENROUTER_API_KEY) && process.env.OPENROUTER_ENABLED !== "0";
}

function baseUrl(): string {
  return (process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function modelName(): string {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

function timeoutMs(): number {
  const raw = Number(process.env.OPENROUTER_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 500 ? raw : 15_000;
}

function maxTokens(): number {
  const raw = Number(process.env.OPENROUTER_MAX_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_TOKENS;
}

type OpenRouterPayload = {
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null; reasoning?: string | null };
  }>;
  usage?: {
    total_tokens?: number;
    /** OpenRouter reports real spend in USD; 0 for `:free` models. */
    cost?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

export async function generateWithOpenRouter(req: CaptionRequest): Promise<CaptionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const model = modelName();
  const startedAt = Date.now();

  const response = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      // OpenRouter uses these for attribution only; no visitor data is sent.
      "http-referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://jutaone.biz",
      "x-title": "JutaOne.Biz",
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

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenRouter responded ${response.status}: ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as OpenRouterPayload;
  const choice = payload.choices?.[0];
  const caption = normalize(choice?.message?.content ?? "");

  if (!caption) {
    // The token budget was consumed by reasoning before any caption was
    // written. Surfacing the reason keeps triage honest instead of logging a
    // meaningless "empty response".
    const reasoningTokens = payload.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    throw new Error(
      `OpenRouter returned no caption (finish=${choice?.finish_reason ?? "unknown"}, reasoning_tokens=${reasoningTokens}); raise OPENROUTER_MAX_TOKENS`,
    );
  }

  return {
    caption,
    source: "openrouter",
    model,
    costUsd: typeof payload.usage?.cost === "number" ? payload.usage.cost : 0,
    latencyMs: Date.now() - startedAt,
  };
}

/** Same normalisation as the Meta adapter, kept local to avoid a shared util. */
function normalize(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```[a-z]*\s*/i, "").replace(/```$/i, "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  return text.replace(/\n{3,}/g, "\n\n").slice(0, 400);
}

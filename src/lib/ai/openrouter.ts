import { normalizeCaption } from "./caption";
import { buildSystemPrompt, buildUserPrompt, type CaptionRequest, type CaptionResult } from "./prompt";

/**
 * OpenRouter is OpenAI-compatible, so the request shape is the same as Meta's.
 *
 * The development-phase model is a free, non-reasoning one, because the free
 * reasoning models cannot be made fast: they spend 650-1330 completion tokens
 * before writing anything, and `reasoning.effort` / `reasoning.max_tokens` are
 * ignored. Sending `reasoning: { enabled: false }` is what makes this path
 * respond in 1-2 seconds instead of 9-14.
 *
 * Not every model accepts that flag — some reject it with
 * "Reasoning is mandatory for this endpoint" — so the request is retried once
 * without the flag rather than dropping straight to the local template. That
 * keeps a model swap (e.g. to DeepSeek at launch) from silently disabling real
 * generation.
 */
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "dots-studio/dots-3-note-preview:free";
/** A 240-character caption needs ~120 tokens; 400 leaves room without waste. */
const DEFAULT_MAX_TOKENS = 400;

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
  // Non-reasoning answers land in ~1.2-2.4s; 8s is generous, and timing out
  // early is better than holding the visitor for a caption that never comes.
  return Number.isFinite(raw) && raw > 500 ? raw : 8000;
}

function maxTokens(): number {
  const raw = Number(process.env.OPENROUTER_MAX_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_TOKENS;
}

/** `OPENROUTER_REASONING=on` keeps the model's default (needed for reasoning-only models). */
function reasoningDisabled(): boolean {
  return process.env.OPENROUTER_REASONING !== "on";
}

type OpenRouterPayload = {
  error?: { message?: string; code?: number };
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

async function callOpenRouter(
  req: CaptionRequest,
  opts: { reasoning: boolean },
): Promise<{ response: Response; payload: OpenRouterPayload }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const body: Record<string, unknown> = {
    model: modelName(),
    temperature: 0.8,
    max_tokens: maxTokens(),
    messages: [
      { role: "system", content: buildSystemPrompt(req.locale, req.region) },
      { role: "user", content: buildUserPrompt(req.text) },
    ],
  };
  if (!opts.reasoning) body.reasoning = { enabled: false };

  const response = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      // OpenRouter uses these for attribution only; no visitor data is sent.
      "http-referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://jutaone.biz",
      "x-title": "JutaOne.Biz",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs()),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as OpenRouterPayload;
  return { response, payload };
}

export async function generateWithOpenRouter(req: CaptionRequest): Promise<CaptionResult> {
  const startedAt = Date.now();

  let { response, payload } = await callOpenRouter(req, { reasoning: !reasoningDisabled() });

  // A reasoning-only model refuses the flag. Retry once with the model's own
  // default so a model swap degrades to "slow" rather than "no AI at all".
  if (reasoningDisabled() && !response.ok && isReasoningMandatory(payload)) {
    ({ response, payload } = await callOpenRouter(req, { reasoning: true }));
  }

  if (!response.ok) {
    const detail = payload?.error?.message ?? "";
    throw new Error(`OpenRouter responded ${response.status}: ${detail.slice(0, 200)}`);
  }

  const choice = payload.choices?.[0];
  const caption = normalizeCaption(choice?.message?.content ?? "");

  if (!caption) {
    // The token budget was consumed by reasoning before any caption was
    // written. Surfacing the reason keeps triage honest instead of logging a
    // meaningless "empty response".
    const reasoningTokens = payload.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    throw new Error(
      `OpenRouter returned no caption (finish=${choice?.finish_reason ?? "unknown"}, reasoning_tokens=${reasoningTokens}); raise OPENROUTER_MAX_TOKENS or pick a non-reasoning model`,
    );
  }

  return {
    caption,
    source: "openrouter",
    model: modelName(),
    costUsd: typeof payload.usage?.cost === "number" ? payload.usage.cost : 0,
    latencyMs: Date.now() - startedAt,
  };
}

function isReasoningMandatory(payload: OpenRouterPayload | undefined): boolean {
  return /reasoning is mandatory/i.test(payload?.error?.message ?? "");
}

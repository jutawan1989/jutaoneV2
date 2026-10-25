import { normalizeCaption } from "./caption";
import { buildSystemPrompt, buildUserPrompt, type CaptionRequest, type CaptionResult } from "./prompt";

/**
 * OpenRouter is OpenAI-compatible, so the request shape matches the other
 * adapters, with two OpenRouter-specific behaviours:
 *
 * 1. `models` (array) instead of `model`. OpenRouter walks the list and serves
 *    the first one it can, which is how a per-model rate limit or an unavailable
 *    model is ridden over without the caller retrying.
 * 2. `reasoning: { enabled: false }` keeps non-reasoning models fast. A model
 *    that rejects the flag is retried once without it, so a model swap degrades
 *    to "slow" rather than "no AI".
 *
 * IMPORTANT, measured against the live API: OpenRouter's free-tier daily cap
 * (`openrouter_free_tier_daily`, 50/day) is ACCOUNT-wide, not per-model. Once it
 * is spent, every `:free` model on every endpoint returns the same 429 with the
 * same reset. A fallback array therefore does NOT buy more requests per day; it
 * only rides over per-model limits and model outages. Raising the ceiling needs
 * credits on the account, not more models in this list.
 */
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Free, non-reasoning models in preference order.
 *
 * MEASURED LIMIT: OpenRouter rejects a longer list with
 * `400 'models' array must have 3 items or fewer.` The brief asked for 3-5;
 * three is the hard ceiling, so the three most likely to answer are kept in
 * order. Spares belong in `OPENROUTER_MODELS` when one of these is retired.
 *
 * Every entry is free: either pinned by the `:free` suffix, or the
 * catalogue-verified `openrouter/free` router (pricing 0/0 in `/models`).
 */
export const DEFAULT_FREE_MODELS = [
  "dots-studio/dots-3-note-preview:free",
  "nvidia/nemotron-3.5-lightning:free",
  "openrouter/free",
] as const;

/** OpenRouter's hard limit on the fallback array. */
export const MAX_FALLBACK_MODELS = 3;

/** A 240-character caption needs ~120 tokens. */
const DEFAULT_MAX_TOKENS = 400;

export function openRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY) && process.env.OPENROUTER_ENABLED !== "0";
}

function baseUrl(): string {
  return (process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

/**
 * Model list, from `OPENROUTER_MODELS` (comma separated) or the single
 * `OPENROUTER_MODEL` for backwards compatibility, falling back to the default.
 */
export function openRouterModels(): string[] {
  const list = process.env.OPENROUTER_MODELS;
  if (list && list.trim()) {
    const models = list.split(",").map((m) => m.trim()).filter(Boolean);
    if (models.length > 0) {
      // Truncate rather than let the API reject the whole request: a fourth
      // entry would turn a working configuration into a hard 400.
      return models.slice(0, MAX_FALLBACK_MODELS);
    }
  }
  const single = process.env.OPENROUTER_MODEL;
  if (single && single.trim()) return [single.trim()];
  return [...DEFAULT_FREE_MODELS];
}

/**
 * Models documented as free in OpenRouter's catalogue despite lacking the
 * `:free` suffix. Verified against `/models`: `openrouter/free` reports
 * `pricing.prompt = "0"` and `pricing.completion = "0"`.
 *
 * Kept as an explicit allow-list rather than a loose rule, because "free or
 * looks free" is exactly how a paid model slips through.
 */
const FREE_WITHOUT_SUFFIX = new Set(["openrouter/free"]);

/**
 * Guards the "never accidentally get billed" requirement.
 *
 * A `:free` suffix pins a model to the zero-price tier; anything else must be a
 * catalogue-verified exception. An unknown id is rejected, because OpenRouter
 * routes whatever matches and the cost is then whatever the provider charges.
 */
export function assertFreeModels(models: string[]): void {
  const paid = models.filter(
    (model) => !model.endsWith(":free") && !FREE_WITHOUT_SUFFIX.has(model),
  );
  if (paid.length > 0) {
    throw new Error(
      `refusing to call OpenRouter: these models are not the free tier: ${paid.join(", ")}`,
    );
  }
}

function timeoutMs(): number {
  const raw = Number(process.env.OPENROUTER_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 500 ? raw : 8000;
}

function maxTokens(): number {
  const raw = Number(process.env.OPENROUTER_MAX_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_TOKENS;
}

function reasoningDisabled(): boolean {
  return process.env.OPENROUTER_REASONING !== "on";
}

type OpenRouterPayload = {
  error?: { message?: string; code?: number; metadata?: { limit_source?: string } };
  /** The model OpenRouter actually served, not necessarily the first. */
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null; reasoning?: string | null };
  }>;
  usage?: {
    total_tokens?: number;
    cost?: number;
    completion_tokens_detail?: { reasoning_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

async function callOpenRouter(
  req: CaptionRequest,
  opts: { reasoning: boolean },
): Promise<{ response: Response; payload: OpenRouterPayload }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const models = openRouterModels();
  assertFreeModels(models);

  const body: Record<string, unknown> = {
    // Array form: OpenRouter falls through the list on a per-model failure.
    models,
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

  if (reasoningDisabled() && !response.ok && isReasoningMandatory(payload)) {
    ({ response, payload } = await callOpenRouter(req, { reasoning: true }));
  }

  if (!response.ok) {
    const detail = payload?.error?.message ?? "";
    const limit = payload?.error?.metadata?.limit_source;
    // Naming the scope matters: an account-wide daily cap cannot be fixed by
    // adding models to the array, and a generic "429" hides that.
    const scope = limit ? ` [${limit}]` : "";
    throw new Error(`OpenRouter responded ${response.status}${scope}: ${detail.slice(0, 200)}`);
  }

  const choice = payload.choices?.[0];
  const caption = normalizeCaption(choice?.message?.content ?? "");

  if (!caption) {
    const reasoningTokens =
      payload.usage?.completion_tokens_details?.reasoning_tokens ??
      payload.usage?.completion_tokens_detail?.reasoning_tokens ??
      0;
    throw new Error(
      `OpenRouter returned no caption (finish=${choice?.finish_reason ?? "unknown"}, reasoning_tokens=${reasoningTokens})`,
    );
  }

  return {
    caption,
    source: "openrouter",
    // What OpenRouter actually served, which may not be the first entry.
    model: payload.model ?? openRouterModels()[0] ?? "unknown",
    costUsd: typeof payload.usage?.cost === "number" ? payload.usage.cost : 0,
    latencyMs: Date.now() - startedAt,
  };
}

function isReasoningMandatory(payload: OpenRouterPayload | undefined): boolean {
  return /reasoning is mandatory/i.test(payload?.error?.message ?? "");
}

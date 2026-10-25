import { normalizeCaption } from "./caption";
import { buildSystemPrompt, buildUserPrompt, type CaptionRequest, type CaptionResult } from "./prompt";

/**
 * Meta's Llama API exposes an OpenAI-compatible chat completions endpoint.
 * The base URL and model are configurable so the adapter survives a model
 * change without touching call sites.
 *
 * Defaults match the team key in use: `api.llama.com` rejects it with
 * `invalid_api_key`, so the old default silently degraded every caption to the
 * local template whenever only `META_AI_API_KEY` was set. The default model is
 * the non-contributor tier; the `-contributor` variants contribute prompts to
 * training and must be selected deliberately via `META_AI_MODEL`.
 */
const DEFAULT_BASE_URL = "https://api.meta.ai/v1";
const DEFAULT_MODEL = "muse-spark-1.3";

export function metaConfigured(): boolean {
  return Boolean(process.env.META_AI_API_KEY);
}

function modelName(): string {
  return process.env.META_AI_MODEL || DEFAULT_MODEL;
}

function timeoutMs(): number {
  const raw = Number(process.env.META_AI_TIMEOUT_MS);
  // 2500 was too tight once real generation replaced the mock path; the copy
  // now says "in seconds" instead of "under 3 seconds".
  return Number.isFinite(raw) && raw > 500 ? raw : 3500;
}

function costPer1kTokens(): number {
  const raw = Number(process.env.META_AI_COST_PER_1K_TOKENS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0.0006;
}

/** Strips wrappers the model sometimes adds around a single caption. */
export { normalizeCaption };

export async function generateWithMeta(req: CaptionRequest): Promise<CaptionResult> {
  const apiKey = process.env.META_AI_API_KEY;
  if (!apiKey) throw new Error("META_AI_API_KEY is not configured");

  const baseUrl = (process.env.META_AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = modelName();
  const startedAt = Date.now();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      max_tokens: 220,
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
    throw new Error(`Meta AI responded ${response.status}: ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };

  const caption = normalizeCaption(payload.choices?.[0]?.message?.content ?? "");
  if (!caption) throw new Error("Meta AI returned an empty caption");

  const totalTokens = payload.usage?.total_tokens ?? 0;
  const costUsd = totalTokens > 0 ? (totalTokens / 1000) * costPer1kTokens() : 0.002;

  return {
    caption,
    source: "meta",
    model,
    costUsd,
    latencyMs: Date.now() - startedAt,
  };
}

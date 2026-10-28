import { generateCaption, type CaptionResult } from "@/lib/ai";
import { normalizeCaption } from "@/lib/ai/caption";
import type { Locale, Region } from "@/lib/i18n/config";

/**
 * Smart Assistant prompt helpers.
 *
 * Boss spec: "You are JutaOne Smart Assistant, a helpful business advisor for
 * SMEs in Malaysia and Indonesia. Answer concisely in the user's language."
 * The generic caption prompt builders are caption-shaped (hooks, CTAs,
 * hashtags), so the assistant carries its own prompts here rather than
 * reusing them.
 *
 * Kept out of the route module because Next.js route files may only export
 * HTTP handlers and config — same rule as `purchase-kind.ts`.
 */
export const ASSISTANT_SYSTEM_PROMPT =
  "You are JutaOne Smart Assistant, a helpful business advisor for SMEs in Malaysia and Indonesia. Answer concisely in the user's language.";

export function buildAssistantMessages(
  message: string,
  locale: Locale,
): Array<{ role: string; content: string }> {
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

type ChatProvider = { name: string; base: string; model: string; key: string };

function assistantProviders(): ChatProvider[] {
  const list: Array<ChatProvider | null> = [
    process.env.DEEPSEEK_API_KEY
      ? {
          name: "deepseek",
          base: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
          model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
          key: process.env.DEEPSEEK_API_KEY,
        }
      : null,
    process.env.GROQ_API_KEY
      ? {
          name: "groq",
          base: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
          model: process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
          key: process.env.GROQ_API_KEY,
        }
      : null,
    process.env.OPENAI_API_KEY
      ? {
          name: "openai",
          base: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          key: process.env.OPENAI_API_KEY,
        }
      : null,
    process.env.OPENROUTER_API_KEY
      ? {
          name: "openrouter",
          base: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
          model: process.env.OPENROUTER_MODEL || "dots-studio/dots-3-note-preview:free",
          key: process.env.OPENROUTER_API_KEY,
        }
      : null,
    process.env.META_AI_API_KEY
      ? {
          name: "meta",
          base: process.env.META_AI_BASE_URL || "https://api.meta.ai/v1",
          model: process.env.META_AI_MODEL || "muse-spark-1.3",
          key: process.env.META_AI_API_KEY,
        }
      : null,
  ];
  return list.filter((p): p is ChatProvider => p !== null);
}

/**
 * Calls the AI chain (DeepSeek -> Groq -> OpenAI -> OpenRouter -> Meta) with
 * the assistant prompt. Falls back to the local template when no provider key
 * is configured.
 */
export async function generateAssistantReply(req: AssistantRequest): Promise<CaptionResult> {
  const startedAt = Date.now();
  const providers = assistantProviders();

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

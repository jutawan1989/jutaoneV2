import { generateWithGemini, geminiConfigured } from "./gemini";
import { generateWithGroq, groqConfigured } from "./groq";
import { generateWithCustomAI, customAIConfigured } from "./custom";
import { generateWithOpenAI, openAIConfigured } from "./openai";
import { generateWithOpenRouter, openRouterConfigured } from "./openrouter";
import { generateWithMeta, metaConfigured } from "./meta";
import { generateMockCaption } from "./mock";
import { appendWatermark } from "./watermark";
import type { CaptionRequest, CaptionResult } from "./prompt";

export type { CaptionRequest, CaptionResult };

type Provider = {
  name: string;
  configured: () => boolean;
  generate: (req: CaptionRequest) => Promise<CaptionResult>;
};

/**
 * Provider chain, in the Boss cost-saving order (DeepSeek removed):
 *
 *   1. Groq       — primary, fastest of the three (~120ms measured).
 *   2. OpenRouter — free tier, non-reasoning model.
 *   3. Top-Tools-Ai (custom) — CTO directive: first fallback after
 *                   Groq/OpenRouter. New unproven vendor, so it sits here:
 *                   ahead of the paid chain, behind the proven free tier.
 *   4. Gemini     — gemini-2.0-flash via the OpenAI-compatible endpoint.
 *   5. OpenAI     — gpt-4o-mini paid tier, the reliable paid fallback.
 *   6. Meta       — kept last: still blocked by `402 billing_not_configured`, so
 *                   it would only add a failing round trip if it came earlier.
 *
 * DeepSeek is out of the chain (cost decision). The adapter file
 * `deepseek.ts` is kept but unwired and disabled by default — no import here,
 * so no key is ever read. To restore it, re-add the import and the list entry.
 *
 * The local template is not in this list: it is the guaranteed floor, applied
 * when every configured provider has failed or none is configured at all.
 */
const PROVIDERS: Provider[] = [
  { name: "groq", configured: groqConfigured, generate: generateWithGroq },
  { name: "openrouter", configured: openRouterConfigured, generate: generateWithOpenRouter },
  { name: "custom", configured: customAIConfigured, generate: generateWithCustomAI },
  { name: "gemini", configured: geminiConfigured, generate: generateWithGemini },
  { name: "openai", configured: openAIConfigured, generate: generateWithOpenAI },
  { name: "meta", configured: metaConfigured, generate: generateWithMeta },
];

/**
 * AI adapter layer. Swapping providers means changing this module only.
 *
 * - `mock` source: no provider configured, deterministic local templates.
 * - `mock-fallback`: every configured provider failed, so the visitor still gets
 *   a usable caption instead of an error.
 *
 * `latencyMs` covers the whole attempt including the failed hops, so the logged
 * number reflects what the visitor actually waited.
 */
export async function generateCaption(req: CaptionRequest): Promise<CaptionResult> {
  const startedAt = Date.now();
  const active = PROVIDERS.filter((provider) => provider.configured());

  // Viral-loop watermark (Boss + Linda spec): every AI caption carries a
  // subtle JutaOne.Biz link at the very bottom for organic spread.
  const withMark = (result: CaptionResult): CaptionResult => ({
    ...result,
    caption: appendWatermark(result.caption, req.locale),
  });

  if (active.length === 0) {
    return withMark(generateMockCaption(req));
  }

  const failures: string[] = [];
  for (const provider of active) {
    try {
      const result = await provider.generate(req);
      return { ...result, caption: appendWatermark(result.caption, req.locale), latencyMs: Date.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${provider.name}: ${message}`);
      // Logged per hop so a fallback is visible in the logs even when the final
      // caption looks fine.
      console.warn(`[jutaone] ${provider.name} failed, trying next provider:`, message.slice(0, 160));
    }
  }

  console.error("[jutaone] every AI provider failed, using local template", failures.join(" | "));
  const fallback = generateMockCaption(req);
  return { ...fallback, caption: appendWatermark(fallback.caption, req.locale), source: "mock-fallback", latencyMs: Date.now() - startedAt };
}

/** Which providers are configured and in what order, for diagnostics. */
export function providerChain(): Array<{ name: string; configured: boolean }> {
  return PROVIDERS.map((provider) => ({ name: provider.name, configured: provider.configured() }));
}

export { customAIConfigured, geminiConfigured, groqConfigured, metaConfigured, openAIConfigured, openRouterConfigured };

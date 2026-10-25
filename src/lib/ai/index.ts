import { generateWithDeepSeek, deepSeekConfigured } from "./deepseek";
import { generateWithMeta, metaConfigured } from "./meta";
import { generateWithOpenRouter, openRouterConfigured } from "./openrouter";
import { generateMockCaption } from "./mock";
import type { CaptionRequest, CaptionResult } from "./prompt";

export type { CaptionRequest, CaptionResult };

type Provider = {
  name: string;
  configured: () => boolean;
  generate: (req: CaptionRequest) => Promise<CaptionResult>;
};

/**
 * Order matters and is deliberate:
 *
 * 1. DeepSeek — paid and funded, so it is the intended production provider.
 * 2. OpenRouter — free tier, kept as a zero-cost fallback. Once its daily quota
 *    is exhausted (50/day) it 429s and the next provider runs.
 * 3. Meta — wired but still blocked by `402 billing_not_configured`.
 *
 * A paid provider first means a visitor gets the good model while credits last,
 * and the free tier covers the rest of the day instead of the reverse.
 */
const PROVIDERS: Provider[] = [
  { name: "deepseek", configured: deepSeekConfigured, generate: generateWithDeepSeek },
  { name: "openrouter", configured: openRouterConfigured, generate: generateWithOpenRouter },
  { name: "meta", configured: metaConfigured, generate: generateWithMeta },
];

/**
 * AI adapter layer. Swapping providers means changing this module only.
 *
 * - `mock` source: no provider configured, deterministic local templates.
 * - `mock-fallback`: a provider was configured but failed or timed out, so the
 *   visitor still gets a usable caption instead of an error.
 *
 * `latencyMs` covers the whole attempt, including time spent waiting on failing
 * providers, so the logged number stays useful for triage.
 */
export async function generateCaption(req: CaptionRequest): Promise<CaptionResult> {
  const startedAt = Date.now();
  const active = PROVIDERS.filter((provider) => provider.configured());

  if (active.length === 0) {
    return generateMockCaption(req);
  }

  const failures: string[] = [];
  for (const provider of active) {
    try {
      const result = await provider.generate(req);
      return { ...result, latencyMs: Date.now() - startedAt };
    } catch (error) {
      failures.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.error("[jutaone] every AI provider failed, using local template", failures.join(" | "));
  const fallback = generateMockCaption(req);
  return { ...fallback, source: "mock-fallback", latencyMs: Date.now() - startedAt };
}

export { deepSeekConfigured, metaConfigured, openRouterConfigured };

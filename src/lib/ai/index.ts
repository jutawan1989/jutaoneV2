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
 * Provider order is OpenRouter first, then Meta. Meta is currently blocked by
 * `402 billing_not_configured`, so putting it first would add a failing round
 * trip to every request for nothing. Reorder this list once billing is fixed.
 */
const PROVIDERS: Provider[] = [
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

export { metaConfigured, openRouterConfigured };

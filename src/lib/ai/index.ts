import { generateWithDeepSeek, deepSeekConfigured } from "./deepseek";
import { generateWithGroq, groqConfigured } from "./groq";
import { generateWithOpenRouter, openRouterConfigured } from "./openrouter";
import { generateWithMeta, metaConfigured } from "./meta";
import { generateMockCaption } from "./mock";
import type { CaptionRequest, CaptionResult } from "./prompt";

export type { CaptionRequest, CaptionResult };

type Provider = {
  name: string;
  configured: () => boolean;
  generate: (req: CaptionRequest) => Promise<CaptionResult>;
};

/**
 * Provider chain, in the order Linda set:
 *
 *   1. DeepSeek  — primary, funded.
 *   2. Groq      — fallback 1, fastest of the three (~120ms measured).
 *   3. OpenRouter — fallback 2, free tier for when the paid providers fail.
 *   4. Meta      — kept last: still blocked by `402 billing_not_configured`, so
 *                  it would only add a failing round trip if it came earlier.
 *
 * The local template is not in this list: it is the guaranteed floor, applied
 * when every configured provider has failed or none is configured at all.
 */
const PROVIDERS: Provider[] = [
  { name: "deepseek", configured: deepSeekConfigured, generate: generateWithDeepSeek },
  { name: "groq", configured: groqConfigured, generate: generateWithGroq },
  { name: "openrouter", configured: openRouterConfigured, generate: generateWithOpenRouter },
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

  if (active.length === 0) {
    return generateMockCaption(req);
  }

  const failures: string[] = [];
  for (const provider of active) {
    try {
      const result = await provider.generate(req);
      return { ...result, latencyMs: Date.now() - startedAt };
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
  return { ...fallback, source: "mock-fallback", latencyMs: Date.now() - startedAt };
}

/** Which providers are configured and in what order, for diagnostics. */
export function providerChain(): Array<{ name: string; configured: boolean }> {
  return PROVIDERS.map((provider) => ({ name: provider.name, configured: provider.configured() }));
}

export { deepSeekConfigured, groqConfigured, metaConfigured, openRouterConfigured };

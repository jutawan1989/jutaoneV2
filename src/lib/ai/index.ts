import { generateWithMeta, metaConfigured } from "./meta";
import { generateMockCaption } from "./mock";
import type { CaptionRequest, CaptionResult } from "./prompt";

export type { CaptionRequest, CaptionResult };

/**
 * AI adapter layer. Swapping providers means changing this module only.
 *
 * - `META_API` source: real call to Meta's Llama API.
 * - `mock` source: deterministic local templates (no key configured).
 * - `mock-fallback`: provider configured but the call failed or timed out, so
 *   the visitor still gets a usable caption inside the 3 second budget.
 */
export async function generateCaption(req: CaptionRequest): Promise<CaptionResult> {
  if (!metaConfigured()) {
    return generateMockCaption(req);
  }

  try {
    return await generateWithMeta(req);
  } catch (error) {
    console.error("[jutaone] Meta AI call failed, using local template", error);
    const fallback = generateMockCaption(req);
    return { ...fallback, source: "mock-fallback" };
  }
}

export { metaConfigured };

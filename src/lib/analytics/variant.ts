import { createHash } from "node:crypto";

export type Variant = "A" | "B";

/**
 * Sticky 50/50 assignment derived from the salted visitor hash, so it survives
 * reloads, cache clears and cookie clears without storing anything extra.
 */
export function assignVariant(seed: string): Variant {
  const digest = createHash("sha256").update(seed).digest();
  return digest[0] % 2 === 0 ? "A" : "B";
}

/**
 * `?variant=A|B` is honoured outside production so QA and the mockup review can
 * see both creatives without changing the assignment logic.
 */
export function resolveVariant(seed: string, override?: string | null): Variant {
  if (process.env.NODE_ENV !== "production") {
    if (override === "A" || override === "B") return override;
  }
  return assignVariant(seed);
}

export function isVariant(value: unknown): value is Variant {
  return value === "A" || value === "B";
}

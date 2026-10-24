/**
 * Compliance-approved copy. These exact strings are required on the gold/silver
 * widget and must not be reworded without legal sign-off.
 *
 * Rule enforced by `tests/compliance.test.ts`: no promise of profit, earnings
 * or financial return anywhere in the product copy.
 */
export const COMPLIANCE_DISCLAIMER_MS = "Simulasi — bukan nasihat pelaburan/investasi";
export const COMPLIANCE_DISCLAIMER_ID = "Simulasi — bukan nasihat investasi";
export const COMPLIANCE_DISCLAIMER_EN = "Simulation — not investment advice";

/** Phrases that would promise financial returns. Matched case-insensitively. */
export const BANNED_PROMISE_PATTERNS: readonly RegExp[] = [
  /guarantee[ds]?\s+(profit|return|income|earning)/i,
  /risk[\s-]?free/i,
  /sure\s+(profit|win)/i,
  /confirmed\s+(profit|return)/i,
  /dijamin\s+(untung|keuntungan|kaya|profit|pulangan)/i,
  /jaminan\s+(keuntungan|pulangan)/i,
  /pasti\s+untung/i,
  /untung\s+dijamin/i,
  /dijamin\s+(cuan|profit)/i,
  /pasti\s+cuan/i,
  /bebas\s+risiko/i,
  /tanpa\s+risiko/i,
];

export function findBannedPhrases(text: string): string[] {
  return BANNED_PROMISE_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) =>
    pattern.source,
  );
}

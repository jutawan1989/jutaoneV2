/**
 * Shared validation for the admin manual token top-up.
 *
 * Kept in `lib` (not inside the route) so the unit test can exercise it
 * without spinning up Next.js: an amount typo here moves real ledger value,
 * so the parser deserves a test of its own.
 */

/** Upper bound on a single manual credit: a typo above this is caller error. */
export const MAX_MANUAL_TOPUP = 100_000_000;

/**
 * Strips grouping separators from the amount field before submit.
 *
 * The input is `type=text inputMode=numeric` so pasting a Malaysian display
 * value like "1,000,000" keeps every digit; dropping the minus sign means a
 * leading `-` can never smuggle a negative credit past `parseAddTokensInput`.
 */
export function sanitizeAmountInput(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

export type AddTokensInput = { email: string; amount: number };

export function parseAddTokensInput(body: unknown): { ok: true } & AddTokensInput | { ok: false; code: string } {
  const raw = (body ?? {}) as Record<string, unknown>;
  const emailRaw = raw.user_email ?? raw.email;
  const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return { ok: false, code: "invalid_email" };
  }

  const rawAmount = raw.amount ?? raw.tokens;
  const amount = typeof rawAmount === "string" && rawAmount.trim() !== "" ? Number(rawAmount) : rawAmount;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    return { ok: false, code: "invalid_amount" };
  }
  if (amount > MAX_MANUAL_TOPUP) {
    return { ok: false, code: "amount_too_large" };
  }
  return { ok: true, email, amount };
}

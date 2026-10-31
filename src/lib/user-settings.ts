/**
 * Tetapan Akaun — pure validation for the `/api/user/*` routes.
 *
 * Kept free of Next.js imports so vitest can cover it without a request
 * scope; the three route handlers translate these results into HTTP codes.
 */

export const DISPLAY_NAME_MAX = 80;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export type DisplayNameResult =
  | { ok: true; displayName: string }
  | { ok: false; code: "name_invalid" | "name_too_short" };

/** Full name shown on the dashboard. Minimum 2 chars so "A" is rejected. */
export function normalizeDisplayName(value: unknown): DisplayNameResult {
  if (typeof value !== "string") return { ok: false, code: "name_invalid" };
  const displayName = value.trim().slice(0, DISPLAY_NAME_MAX);
  if (displayName.length < 2) return { ok: false, code: "name_too_short" };
  return { ok: true, displayName };
}

export type PasswordChangeResult =
  | { ok: true; currentPassword: string; newPassword: string }
  | {
      ok: false;
      code:
        | "password_incomplete"
        | "password_too_short"
        | "password_too_long"
        | "password_mismatch";
    };

export function validatePasswordChange(input: {
  currentPassword?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
}): PasswordChangeResult {
  const currentPassword =
    typeof input.currentPassword === "string" ? input.currentPassword : "";
  const newPassword =
    typeof input.newPassword === "string" ? input.newPassword : "";
  const confirm =
    typeof input.confirmPassword === "string" ? input.confirmPassword : undefined;
  if (!currentPassword || !newPassword) {
    return { ok: false, code: "password_incomplete" };
  }
  if (newPassword.length < PASSWORD_MIN) {
    return { ok: false, code: "password_too_short" };
  }
  if (newPassword.length > PASSWORD_MAX) {
    return { ok: false, code: "password_too_long" };
  }
  if (confirm !== undefined && confirm !== "" && confirm !== newPassword) {
    return { ok: false, code: "password_mismatch" };
  }
  return { ok: true, currentPassword, newPassword };
}

export type BankUpdate = {
  bank_name?: string | null;
  account_no?: string | null;
  account_holder?: string | null;
};

export type BankDetailsResult =
  | { ok: true; update: BankUpdate }
  | { ok: false; code: "missing_bank_details" };

function pick(body: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (body[key] !== undefined) return body[key];
  }
  return undefined;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Bank details for manual commission payouts, stored on `members`
 * (see supabase/member-settings.sql). Only keys present in the body are
 * included, so a partial save never wipes the other fields; an explicit
 * empty string clears its column (back to null).
 */
export function normalizeBankDetails(
  body: Record<string, unknown>,
): BankDetailsResult {
  const rawBank = pick(body, "bankName", "bank_name");
  const rawNo = pick(body, "accountNo", "account_no", "accountNumber", "account_number");
  const rawHolder = pick(body, "accountHolder", "account_holder");
  if (rawBank === undefined && rawNo === undefined && rawHolder === undefined) {
    return { ok: false, code: "missing_bank_details" };
  }
  const update: BankUpdate = {};
  if (rawBank !== undefined) {
    const bankName = text(rawBank, 80);
    update.bank_name = bankName || null;
  }
  if (rawNo !== undefined) {
    const accountNo = text(rawNo, 40).replace(/\s+/g, "");
    update.account_no = accountNo || null;
  }
  if (rawHolder !== undefined) {
    const accountHolder = text(rawHolder, 80);
    update.account_holder = accountHolder || null;
  }
  if (!update.bank_name && !update.account_no && !update.account_holder) {
    return { ok: false, code: "missing_bank_details" };
  }
  return { ok: true, update };
}

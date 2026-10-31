import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/member";
import {
  normalizeBankDetails,
  normalizeDisplayName,
  validatePasswordChange,
} from "@/lib/user-settings";

describe("PUT /api/user/profile validation", () => {
  it("accepts a trimmed full name", () => {
    expect(normalizeDisplayName("  Ahmad Bin Ali  ")).toEqual({
      ok: true,
      displayName: "Ahmad Bin Ali",
    });
  });

  it("rejects empty and one-letter names", () => {
    expect(normalizeDisplayName("")).toEqual({ ok: false, code: "name_too_short" });
    expect(normalizeDisplayName("A")).toEqual({ ok: false, code: "name_too_short" });
    expect(normalizeDisplayName(123)).toEqual({ ok: false, code: "name_invalid" });
  });

  it("caps at 80 chars", () => {
    const result = normalizeDisplayName("A".repeat(200));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.displayName).toHaveLength(80);
  });
});

describe("POST /api/user/change-password validation", () => {
  it("requires the old password and a new one", () => {
    expect(validatePasswordChange({ newPassword: "baharu-123" })).toEqual({
      ok: false,
      code: "password_incomplete",
    });
    expect(validatePasswordChange({ currentPassword: "lama-12345" })).toEqual({
      ok: false,
      code: "password_incomplete",
    });
  });

  it("enforces the 8-char minimum on the new password", () => {
    expect(
      validatePasswordChange({ currentPassword: "lama-12345", newPassword: "pendek" }),
    ).toEqual({ ok: false, code: "password_too_short" });
  });

  it("rejects a mismatched confirmation", () => {
    expect(
      validatePasswordChange({
        currentPassword: "lama-12345",
        newPassword: "baharu-12345",
        confirmPassword: "lain-12345",
      }),
    ).toEqual({ ok: false, code: "password_mismatch" });
  });

  it("accepts a valid change without confirmation", () => {
    expect(
      validatePasswordChange({ currentPassword: "lama-12345", newPassword: "baharu-12345" }),
    ).toEqual({ ok: true, currentPassword: "lama-12345", newPassword: "baharu-12345" });
  });

  it("verifies the old password against the existing scrypt hash before writing", () => {
    // Same flow as the route: the old password must match the stored hash.
    const stored = hashPassword("kata-lama-2026");
    expect(verifyPassword("kata-lama-2026", stored)).toBe(true);
    expect(verifyPassword("kata-salah", stored)).toBe(false);
    // ...and the replacement hashes/verifies under the same scheme.
    const rotated = hashPassword("kata-baharu-2026");
    expect(verifyPassword("kata-baharu-2026", rotated)).toBe(true);
    expect(verifyPassword("kata-lama-2026", rotated)).toBe(false);
  });
});

describe("PUT /api/user/bank-details validation", () => {
  it("accepts camelCase and snake_case keys, stripping spaces from account no", () => {
    expect(
      normalizeBankDetails({
        bankName: "Maybank",
        accountNo: "1234 567890",
        accountHolder: "Ahmad",
      }),
    ).toEqual({
      ok: true,
      update: { bank_name: "Maybank", account_no: "1234567890", account_holder: "Ahmad" },
    });
    expect(normalizeBankDetails({ bank_name: "CIMB", account_no: "0987654321" })).toEqual({
      ok: true,
      update: { bank_name: "CIMB", account_no: "0987654321" },
    });
  });

  it("allows partial saves without wiping absent fields", () => {
    expect(normalizeBankDetails({ bankName: "RHB" })).toEqual({
      ok: true,
      update: { bank_name: "RHB" },
    });
  });

  it("rejects empty payloads", () => {
    expect(normalizeBankDetails({})).toEqual({ ok: false, code: "missing_bank_details" });
    expect(normalizeBankDetails({ bankName: "  ", accountNo: "" })).toEqual({
      ok: false,
      code: "missing_bank_details",
    });
  });
});

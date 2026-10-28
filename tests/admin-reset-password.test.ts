import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/member";

describe("admin password reset hashing", () => {
  it("round-trips a scrypt hash like the reset route writes", () => {
    const hash = hashPassword("rahasia-baru-2026");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("rahasia-baru-2026", hash)).toBe(true);
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("uses a fresh salt per hash (no two resets collide)", () => {
    const a = hashPassword("same-password-123");
    const b = hashPassword("same-password-123");
    expect(a).not.toBe(b);
    expect(verifyPassword("same-password-123", a)).toBe(true);
    expect(verifyPassword("same-password-123", b)).toBe(true);
  });
});

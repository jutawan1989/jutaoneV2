import { describe, expect, it } from "vitest";
import { parseAddTokensInput, sanitizeAmountInput } from "@/lib/admin/tokens";

describe("admin manual token top-up input", () => {
  it("accepts a valid email and 1,000,000 tokens", () => {
    expect(parseAddTokensInput({ user_email: "Ali@test.com", amount: 1_000_000 })).toEqual({
      ok: true,
      email: "ali@test.com",
      amount: 1_000_000,
    });
  });

  it("accepts the `email` key as an alias", () => {
    const result = parseAddTokensInput({ email: "boss@jutaone.biz", amount: "5000" });
    expect(result).toEqual({ ok: true, email: "boss@jutaone.biz", amount: 5000 });
  });

  it("rejects an invalid email", () => {
    expect(parseAddTokensInput({ user_email: "bukan-email", amount: 100 }).ok).toBe(false);
  });

  it("rejects zero, negative and fractional amounts", () => {
    expect(parseAddTokensInput({ user_email: "a@b.co", amount: 0 }).ok).toBe(false);
    expect(parseAddTokensInput({ user_email: "a@b.co", amount: -50 }).ok).toBe(false);
    expect(parseAddTokensInput({ user_email: "a@b.co", amount: 1.5 }).ok).toBe(false);
  });

  it("rejects absurd amounts that are likely a typo", () => {
    expect(parseAddTokensInput({ user_email: "a@b.co", amount: 999_999_999 }).ok).toBe(false);
  });
});

describe("sanitizeAmountInput", () => {
  it("keeps digits and strips grouping separators", () => {
    // Gagal sebenar yang dilaporkan: input type=number menolak "1,000,000"
    // (format paparan Malaysia), jadi Boss hanya boleh taip digit tanpa koma.
    expect(sanitizeAmountInput("1,000,000")).toBe("1000000");
    expect(sanitizeAmountInput("1 000 000")).toBe("1000000");
    expect(sanitizeAmountInput("RM 1,000")).toBe("1000");
    expect(sanitizeAmountInput("1000000")).toBe("1000000");
    expect(sanitizeAmountInput("")).toBe("");
  });
});

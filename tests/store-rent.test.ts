import { describe, expect, it } from "vitest";
import { STORE_RENT_DAYS, STORE_RENT_TOKENS } from "@/lib/rent";

describe("store rent constants (CTO spec)", () => {
  it("rent is 5,000,000 tokens for 30 days", () => {
    expect(STORE_RENT_TOKENS).toBe(5_000_000);
    expect(STORE_RENT_DAYS).toBe(30);
  });
});

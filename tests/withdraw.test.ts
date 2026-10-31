import { describe, expect, it } from "vitest";
import { ADMIN_FEE_MINOR, MIN_PAYOUT_MINOR, REDEEM_MINOR } from "@/lib/affiliate";

describe("withdrawal rules (Boss spec, USD cents)", () => {
  it("redeems $5.00 with a $2.00 admin fee", () => {
    expect(REDEEM_MINOR).toBe(500);
    expect(ADMIN_FEE_MINOR).toBe(200);
  });

  it("requires at least $7.00 in the account", () => {
    expect(MIN_PAYOUT_MINOR).toBe(700);
    expect(MIN_PAYOUT_MINOR).toBe(REDEEM_MINOR + ADMIN_FEE_MINOR);
  });
});

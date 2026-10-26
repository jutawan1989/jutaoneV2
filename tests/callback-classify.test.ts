import { describe, expect, it } from "vitest";
import { classifyPurchase } from "@/lib/payment/purchase-kind";

/**
 * Rent and token top-ups arrive on the same endpoint, signed by the same key.
 * The purchase notes are the only thing that tells them apart, so a mistake
 * here either grants a store for free or books rent as a token sale.
 */
const OWNER = "a".repeat(64);

describe("webhook purchase classification", () => {
  it("treats a purchase without notes as a token top-up", () => {
    expect(classifyPurchase(undefined).kind).toBe("tokens");
    expect(classifyPurchase("").kind).toBe("tokens");
    expect(classifyPurchase("variant=A;region=MY").kind).toBe("tokens");
  });

  it("detects a rent payment", () => {
    const result = classifyPurchase(`kind=rent;owner=${OWNER};usd=500;monthly`);
    expect(result.kind).toBe("rent");
    expect(result.ownerRef).toBe(OWNER);
    expect(result.usdCents).toBe(500);
    expect(result.monthly).toBe(true);
  });

  it("does not mistake a token note for rent", () => {
    // The marker must be its own key, not a substring: "rental" or a note that
    // merely mentions rent must not open a store for free.
    expect(classifyPurchase("note=cheaper-than-rental").kind).toBe("tokens");
    expect(classifyPurchase("kind=tokens;owner=" + OWNER).kind).toBe("tokens");
  });

  it("requires the marker as a whole key", () => {
    expect(classifyPurchase("kind=rent").kind).toBe("rent");
    expect(classifyPurchase("a=1;kind=rent;b=2").kind).toBe("rent");
    // A prefix match would wrongly accept this.
    expect(classifyPurchase("kind=rental").kind).toBe("tokens");
  });

  it("extracts the owner only when it is a full 64-char hash", () => {
    expect(classifyPurchase(`kind=rent;owner=${OWNER}`).ownerRef).toBe(OWNER);
    // A truncated or injected value must not be accepted as an owner.
    expect(classifyPurchase("kind=rent;owner=abc").ownerRef).toBeNull();
    expect(classifyPurchase(`kind=rent;owner=${"z".repeat(64)}`).ownerRef).toBeNull();
  });

  it("reads the USD amount when present", () => {
    expect(classifyPurchase("kind=rent;usd=500").usdCents).toBe(500);
    expect(classifyPurchase("kind=rent").usdCents).toBeNull();
    expect(classifyPurchase("kind=rent;usd=abc").usdCents).toBeNull();
  });
});

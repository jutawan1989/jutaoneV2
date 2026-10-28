import { describe, expect, it } from "vitest";
import {
  TOYYIBPAY_FEE_SEN,
  parseCreateBillResponse,
  parseToyyibReference,
  toyyibBaseUrl,
} from "@/lib/payment/toyyibpay";
import { TOYYIBPAY_FEE_RM, TOYYIBPAY_FEE_SEN as PRICING_FEE_SEN, formatRm } from "@/lib/pricing";

describe("toyyibpay adapter", () => {
  it("charges RM1.00 fee on top of the RM base", () => {
    expect(TOYYIBPAY_FEE_SEN).toBe(100);
    expect(PRICING_FEE_SEN).toBe(100);
    expect(TOYYIBPAY_FEE_RM).toBe(1);
    expect(formatRm(1)).toBe("RM4.70");
  });

  it("parses a successful createBill body", () => {
    expect(parseCreateBillResponse('[{"BillCode":"gcbhict9"}]')).toBe("gcbhict9");
  });

  it("rejects failure bodies (HTTP 200 is not success)", () => {
    expect(parseCreateBillResponse('{"status":"error","msg":"billName exceed limit. Max 30 length"}')).toBeNull();
    expect(parseCreateBillResponse("[KEY-DID-NOT-EXIST]")).toBeNull();
    expect(parseCreateBillResponse("[CATEGORY-NOT-MATCH]")).toBeNull();
    expect(parseCreateBillResponse("")).toBeNull();
  });

  it("parses the external reference for base, fee, owner", () => {
    const owner = "a".repeat(64);
    const ref = parseToyyibReference(`JO-ABC;rm=470;fee=100;usd=100;owner=${owner};variant=a;region=MY`);
    expect(ref).toEqual({ baseSen: 470, feeSen: 100, usdCents: 100, ownerRef: owner });
  });

  it("rejects malformed references", () => {
    expect(parseToyyibReference(null)).toEqual({
      baseSen: null,
      feeSen: null,
      usdCents: null,
      ownerRef: null,
    });
    expect(parseToyyibReference("JO-ABC;rm=0;owner=short")).toEqual({
      baseSen: null,
      feeSen: null,
      usdCents: null,
      ownerRef: null,
    });
  });

  it("defaults to live host, sandbox on opt-in", () => {
    const saved = process.env.TOYYIBPAY_USE_SANDBOX;
    delete process.env.TOYYIBPAY_USE_SANDBOX;
    expect(toyyibBaseUrl()).toBe("https://toyyibpay.com");
    process.env.TOYYIBPAY_USE_SANDBOX = "1";
    expect(toyyibBaseUrl()).toBe("https://dev.toyyibpay.com");
    if (saved === undefined) delete process.env.TOYYIBPAY_USE_SANDBOX;
    else process.env.TOYYIBPAY_USE_SANDBOX = saved;
  });
});

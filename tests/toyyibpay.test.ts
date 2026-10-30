import { describe, expect, it, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import {
  TOYYIBPAY_CALLBACK_URL,
  TOYYIBPAY_FEE_SEN,
  createToyyibBill,
  parseCreateBillResponse,
  parseToyyibReference,
  toyyibBaseUrl,
  verifyToyyibCallback,
  verifyToyyibHash,
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

  it("accepts UUID and short member owners (real sandbox bill shape)", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(
      parseToyyibReference(`JO-MIVU6E5N;rm=470;fee=100;usd=100;owner=${uuid};variant=A;region=MY`).ownerRef,
    ).toBe(uuid);
    expect(
      parseToyyibReference("JO-MIVU6E5N;rm=470;fee=100;usd=100;owner=ef4c35cba").ownerRef,
    ).toBe("ef4c35cba");
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

  it("pins the callback to the live domain, never a request origin", () => {
    expect(TOYYIBPAY_CALLBACK_URL).toBe("https://jutaone.biz/api/topup/toyyib-callback");
  });

  it("sends the pinned callback URL when creating a bill", async () => {
    process.env.TOYYIBPAY_SECRET_KEY = "test-secret";
    process.env.TOYYIBPAY_CATEGORY_CODE = "test-cat";
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      (async (url: string, init?: { body?: unknown }) => {
        seen.push(String((init?.body as URLSearchParams)?.toString() ?? init?.body ?? ""));
        return new Response('[{"BillCode":"testbill1"}]', { status: 200 });
      }) as typeof fetch,
    );
    try {
      const bill = await createToyyibBill({
        locale: "ms",
        region: "MY",
        variant: "A",
        origin: "https://evil.example",
        amountUsd: 1,
        ownerRef: "a".repeat(64),
        customerEmail: "boss@jutaone.biz",
        customerName: "Boss",
      });
      expect(bill.mode).toBe("toyyibpay");
      const body = new URLSearchParams(seen[0] ?? "");
      expect(body.get("billCallbackUrl")).toBe("https://jutaone.biz/api/topup/toyyib-callback");
    } finally {
      vi.unstubAllGlobals();
      delete process.env.TOYYIBPAY_SECRET_KEY;
      delete process.env.TOYYIBPAY_CATEGORY_CODE;
    }
  });

  it("accepts the official MD5 callback hash", () => {
    process.env.TOYYIBPAY_SECRET_KEY = "s3cr3t";
    try {
      const expected = createHash("md5").update("s3cr3t" + "1" + "OID1" + "REF1" + "ok").digest("hex");
      expect(verifyToyyibHash({ status: "1", order_id: "OID1", refno: "REF1", hash: expected })).toEqual({
        ok: true,
      });
    } finally {
      delete process.env.TOYYIBPAY_SECRET_KEY;
    }
  });

  it("rejects a wrong callback hash", () => {
    process.env.TOYYIBPAY_SECRET_KEY = "s3cr3t";
    try {
      expect(
        verifyToyyibHash({ status: "1", order_id: "OID1", refno: "REF1", hash: "0".repeat(32) }),
      ).toEqual({ ok: false, reason: "invalid_hash" });
    } finally {
      delete process.env.TOYYIBPAY_SECRET_KEY;
    }
  });

  it("rejects success callbacks when hash is missing and verification cannot confirm", async () => {
    process.env.TOYYIBPAY_SECRET_KEY = "s3cr3t";
    process.env.TOYYIBPAY_CATEGORY_CODE = "test-cat";
    vi.stubGlobal(
      "fetch",
      (async () => new Response("[]", { status: 200 })) as typeof fetch,
    );
    try {
      const owner = "a".repeat(64);
      const orderId = `JO-X;rm=470;fee=100;usd=100;owner=${owner};variant=a;region=MY`;
      const result = await verifyToyyibCallback({
        refno: "TP123456",
        orderId,
        hash: null,
        status: "1",
        billcode: "bill1",
        amount: null,
        reason: null,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("missing_hash");
    } finally {
      vi.unstubAllGlobals();
      delete process.env.TOYYIBPAY_SECRET_KEY;
      delete process.env.TOYYIBPAY_CATEGORY_CODE;
    }
  });

  it("matches getBillTransactions on order_id, not refno", async () => {
    const secret = "s3cr3t";
    process.env.TOYYIBPAY_SECRET_KEY = secret;
    process.env.TOYYIBPAY_CATEGORY_CODE = "test-cat";
    const owner = "a".repeat(64);
    const orderId = `JO-X;rm=470;fee=100;usd=100;owner=${owner};variant=a;region=MY`;
    const hash = createHash("md5").update(secret + "1" + orderId + "TP123456" + "ok").digest("hex");
    vi.stubGlobal(
      "fetch",
      (async () =>
        new Response(
          JSON.stringify([{ billExternalReferenceNo: orderId, billpaymentStatus: "1" }]),
          { status: 200 },
        )) as typeof fetch,
    );
    try {
      const result = await verifyToyyibCallback({
        refno: "TP123456",
        orderId,
        hash,
        status: "1",
        billcode: "bill1",
        amount: "5.70",
        reason: null,
      });
      expect(result).toEqual({ ok: true });
    } finally {
      vi.unstubAllGlobals();
      delete process.env.TOYYIBPAY_SECRET_KEY;
      delete process.env.TOYYIBPAY_CATEGORY_CODE;
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});

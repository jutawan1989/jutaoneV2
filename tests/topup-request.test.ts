import { describe, expect, it } from "vitest";
import { buildTopUpRequestBody, classifyTopUpErrorCode } from "@/components/topup-button";

/**
 * CTO task: the "Teruskan ke Pembayaran" CTA must POST the right body to
 * `/api/topup` — `gateway: "stripe"` always, with the USD amount.
 * API failures must surface a specific message, never just the generic
 * "masalah teknikal".
 */
describe("top-up request body", () => {
  it("always routes via Stripe", () => {
    const body = buildTopUpRequestBody({ locale: "ms", variant: "A" });
    expect(body.gateway).toBe("stripe");
    expect(body.locale).toBe("ms");
  });

  it("sends the USD amount with the receipt email", () => {
    const body = buildTopUpRequestBody({
      locale: "ms",
      variant: "A",
      amountUsd: 5,
      email: "boss@jutaone.biz",
    });
    expect(body.amountUsd).toBe(5);
    expect(body.email).toBe("boss@jutaone.biz");
  });
});

describe("top-up error classification", () => {
  it("maps invalid_email to the email message", () => {
    expect(classifyTopUpErrorCode("invalid_email")).toBe("email");
  });

  it("maps topup_unavailable (Stripe down) to the service message", () => {
    expect(classifyTopUpErrorCode("topup_unavailable")).toBe("service");
  });

  it("falls back to generic for unknown codes", () => {
    expect(classifyTopUpErrorCode("curlec_closed")).toBe("generic");
    expect(classifyTopUpErrorCode(undefined)).toBe("generic");
    expect(classifyTopUpErrorCode(null)).toBe("generic");
  });
});

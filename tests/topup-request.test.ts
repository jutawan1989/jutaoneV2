import { describe, expect, it } from "vitest";
import { buildTopUpRequestBody, classifyTopUpErrorCode } from "@/components/topup-button";

/**
 * CTO task: the "Teruskan ke Pembayaran" CTA must POST the right body to
 * `/api/topup` — `gateway: "curlec"` always, and `international: true`
 * exactly when the foreign-card box is ticked. API failures must surface a
 * specific message, never just the generic "masalah teknikal".
 */
describe("top-up request body", () => {
  it("always routes via Curlec", () => {
    const body = buildTopUpRequestBody({ locale: "ms", variant: "A" });
    expect(body.gateway).toBe("curlec");
    expect(body.locale).toBe("ms");
  });

  it("sends international: true when the foreign-card box is ticked", () => {
    const body = buildTopUpRequestBody({
      locale: "ms",
      variant: "A",
      amountMyr: 4.7,
      international: true,
      email: "boss@jutaone.biz",
    });
    expect(body.international).toBe(true);
    expect(body.amountMyr).toBe(4.7);
    expect(body.email).toBe("boss@jutaone.biz");
  });

  it("sends an explicit international: false when unticked (never undefined)", () => {
    const body = buildTopUpRequestBody({ locale: "ms", variant: "A", amountMyr: 4.7 });
    expect(body.international).toBe(false);
    expect("international" in body).toBe(true);
  });

  it("coerces truthy non-booleans to a real boolean", () => {
    const body = buildTopUpRequestBody({
      locale: "ms",
      variant: "A",
      // Simulates a checkbox value arriving as something other than boolean.
      international: "true" as unknown as boolean,
    });
    expect(body.international).toBe(false);
  });
});

describe("top-up error classification", () => {
  it("maps invalid_email to the email message", () => {
    expect(classifyTopUpErrorCode("invalid_email")).toBe("email");
  });

  it("maps topup_unavailable (Curlec down) to the service message", () => {
    expect(classifyTopUpErrorCode("topup_unavailable")).toBe("service");
  });

  it("falls back to generic for unknown codes", () => {
    expect(classifyTopUpErrorCode("stripe_closed")).toBe("generic");
    expect(classifyTopUpErrorCode(undefined)).toBe("generic");
    expect(classifyTopUpErrorCode(null)).toBe("generic");
  });
});

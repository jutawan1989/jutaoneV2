import { describe, expect, it } from "vitest";
import {
  createStripeCheckoutSession,
  parseStripeEvent,
  recordStripeTopUp,
  stripeConfigured,
  tokensForStripeSession,
  verifyStripeSignature,
} from "@/lib/payment/stripe";

/**
 * Stripe CLOSED suite (CTO directive: Curlec is the single gateway).
 *
 * The live Stripe implementation has been removed. Every exercise path
 * below must refuse instead of opening a session, verifying a signature,
 * parsing an event, or crediting tokens.
 */

describe("stripe closed", () => {
  it("reports unconfigured — no key is ever read", () => {
    expect(stripeConfigured()).toBe(false);
  });

  it("never opens a session", async () => {
    await expect(createStripeCheckoutSession(1, "owner", "boss@jutaone.biz")).rejects.toThrow(
      /Stripe CLOSED/,
    );
  });

  it("never verifies a signature", () => {
    expect(verifyStripeSignature("{}", "t=1,v1=abc")).toEqual({
      ok: false,
      reason: "stripe_closed",
    });
  });

  it("never parses an event", () => {
    expect(parseStripeEvent('{"type":"checkout.session.completed"}')).toBeNull();
  });

  it("never mints tokens", () => {
    expect(tokensForStripeSession({ usdCents: 100, amountTotalCents: 100 })).toBeNull();
  });

  it("never records a top-up", async () => {
    const throwingDb = {
      from: () => {
        throw new Error("stripe path must never touch the DB");
      },
      rpc: () => {
        throw new Error("stripe path must never touch the DB");
      },
    };
    const out = await recordStripeTopUp(throwingDb, {
      sessionId: "cs_test_abc123",
      reference: "JO-TESTREF",
      ownerRef: "owner",
      usdCents: 100,
      amountTotalCents: 100,
      currency: "USD",
      email: "boss@jutaone.biz",
      paymentStatus: "paid",
    });
    expect(out).toEqual({ recorded: false, reason: "stripe_closed" });
  });
});

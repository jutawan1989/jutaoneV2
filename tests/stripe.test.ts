import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createStripeCheckoutSession,
  InvalidStripeEmailError,
  parseStripeEvent,
  recordStripeTopUp,
  stripeConfigured,
  tokensForStripeSession,
  verifyStripeSignature,
  type StripeCreditDb,
  type StripeWebhookSession,
} from "@/lib/payment/stripe";

/**
 * Stripe Test Mode credit path.
 *
 * Boss spec: integer sen/cents end to end — 100 for $1.00. A float reaching
 * a bigint column fails the upsert and the webhook would answer 200 with
 * `{recorded:false}` while crediting nothing, so every path here is
 * integer-only and fails closed.
 */

type Captured = { topups: Record<string, unknown>[]; ledger: Record<string, unknown>[] };

function mockDb(failLedgerOnce = false): {
  db: StripeCreditDb;
  captured: Captured;
  failWrites: { topups: boolean };
} {
  const captured: Captured = { topups: [], ledger: [] };
  const calls: { ledger: number } = { ledger: 0 };
  const failWrites = { topups: false };
  const db: StripeCreditDb = {
    from(table: string) {
      const unsupported = {
        upsert: async () => ({ error: { message: `unexpected table ${table}` } }),
        insert: async () => ({ error: { message: `unexpected table ${table}` } }),
      };
      if (table === "topups") {
        return {
          ...unsupported,
          upsert: async (row: Record<string, unknown>) => {
            // Simulate the live Postgres bigint guard: a non-integer must
            // fail the write the way the real column does.
            for (const key of ["amount", "base_amount"] as const) {
              const v = row[key];
              if (v !== null && v !== undefined && !Number.isSafeInteger(v)) {
                return { error: { message: `invalid input syntax for type bigint: "${String(v)}"` } };
              }
            }
            if (failWrites.topups) return { error: { message: "boom" } };
            captured.topups.push(row);
            return { error: null };
          },
        };
      }
      if (table === "token_ledger") {
        return {
          ...unsupported,
          insert: async (row: Record<string, unknown>) => {
            calls.ledger += 1;
            if (failLedgerOnce && calls.ledger === 1) return { error: { message: "boom" } };
            for (const key of ["delta", "tokens"] as const) {
              const v = row[key];
              if (!Number.isSafeInteger(v)) {
                return { error: { message: `invalid input syntax for type bigint: "${String(v)}"` } };
              }
            }
            captured.ledger.push(row);
            return { error: null };
          },
        };
      }
      return unsupported;
    },
  };
  return { db, captured, failWrites };
}

const OWNER = "3a8574f1d";

function paidSession(partial?: Partial<StripeWebhookSession>): StripeWebhookSession {
  return {
    sessionId: "cs_test_abc123",
    reference: "JO-TESTREF",
    ownerRef: OWNER,
    usdCents: 100,
    amountTotalCents: 100,
    currency: "USD",
    email: "boss@jutaone.biz",
    paymentStatus: "paid",
    ...partial,
  };
}

/** Builds a real `Stripe-Signature` header the verifier must accept. */
function signStripePayload(rawBody: string, secret: string, t?: number): string {
  const stamp = t ?? Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${stamp}.${rawBody}`, "utf8").digest("hex");
  return `t=${stamp},v1=${sig}`;
}

const RAW_PAID_EVENT = JSON.stringify({
  id: "evt_test_1",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_abc123",
      client_reference_id: "JO-TESTREF",
      amount_total: 100,
      currency: "usd",
      customer_email: "boss@jutaone.biz",
      payment_status: "paid",
      metadata: { reference: "JO-TESTREF", usd_cents: "100", owner: OWNER },
    },
  },
});

describe("stripe checkout session (Test Mode)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("is unconfigured without the secret key (mock mode)", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(stripeConfigured()).toBe(false);
  });

  it("is configured with a sk_test_ key", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    expect(stripeConfigured()).toBe(true);
  });

  it("returns a mock session (same shape, local redirect) when unconfigured", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const session = await createStripeCheckoutSession(1, OWNER, "boss@jutaone.biz", {
      origin: "https://x.test",
      locale: "ms",
    });
    expect(session.mode).toBe("mock");
    expect(session.usdCents).toBe(100);
    expect(session.amountSen).toBe(100);
    expect(session.tokens).toBe(1_000_000);
    expect(session.checkoutUrl).toContain("?ref=");
    expect(session.checkoutUrl).toContain("mode=mock");
  });

  it("throws InvalidStripeEmailError instead of a dummy address", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    await expect(createStripeCheckoutSession(1, OWNER, "not-an-email", { origin: "https://x.test" })).rejects.toBeInstanceOf(
      InvalidStripeEmailError,
    );
    await expect(createStripeCheckoutSession(1, OWNER, undefined, { origin: "https://x.test" })).rejects.toBeInstanceOf(
      InvalidStripeEmailError,
    );
  });

  it("posts integer cents to the Stripe API (100 for $1.00, never 1.00)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      (async (_url: string, init?: { body?: unknown }) => {
        seen.push(String(init?.body ?? ""));
        return new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.com/pay/cs_test_1" }), {
          status: 200,
        });
      }) as typeof fetch,
    );
    const session = await createStripeCheckoutSession(1, OWNER, "boss@jutaone.biz", {
      origin: "https://jutaone.biz",
      locale: "ms",
    });
    expect(session.mode).toBe("stripe");
    expect(session.sessionId).toBe("cs_test_1");
    expect(session.checkoutUrl).toBe("https://checkout.stripe.com/pay/cs_test_1");
    const body = new URLSearchParams(seen[0] ?? "");
    expect(body.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(body.get("line_items[0][price_data][unit_amount]")).toBe("100");
    expect(body.get("metadata[usd_cents]")).toBe("100");
    expect(body.get("metadata[owner]")).toBe(OWNER);
    expect(body.get("metadata[reference]")).toBe(session.reference);
    expect(body.get("client_reference_id")).toBe(session.reference);
    expect(body.get("success_url")).toContain(`ref=${session.reference}`);
  });
});

describe("stripe signature verification", () => {
  const savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const savedAllow = process.env.STRIPE_ALLOW_UNSIGNED_CALLBACKS;

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = savedSecret;
    if (savedAllow === undefined) delete process.env.STRIPE_ALLOW_UNSIGNED_CALLBACKS;
    else process.env.STRIPE_ALLOW_UNSIGNED_CALLBACKS = savedAllow;
  });

  it("accepts a correctly signed payload", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const raw = '{"id":"evt_1"}';
    expect(verifyStripeSignature(raw, signStripePayload(raw, "whsec_test"))).toEqual({ ok: true });
  });

  it("rejects a tampered payload", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const header = signStripePayload('{"id":"evt_1"}', "whsec_test");
    expect(verifyStripeSignature('{"id":"evt_2"}', header).ok).toBe(false);
  });

  it("rejects a stale timestamp (> 5 min skew)", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const raw = '{"id":"evt_1"}';
    const stale = signStripePayload(raw, "whsec_test", Math.floor(Date.now() / 1000) - 601);
    expect(verifyStripeSignature(raw, stale)).toEqual({ ok: false, reason: "stale_signature" });
  });

  it("rejects a missing signature header", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    expect(verifyStripeSignature("{}", null)).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("fails closed without a webhook secret", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_ALLOW_UNSIGNED_CALLBACKS;
    expect(verifyStripeSignature("{}", "t=1,v1=abc").ok).toBe(false);
  });

  it("only accepts unsigned callbacks with an explicit local opt-in", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_ALLOW_UNSIGNED_CALLBACKS = "1";
    try {
      expect(verifyStripeSignature("{}", null)).toEqual({ ok: true });
    } finally {
      delete process.env.STRIPE_ALLOW_UNSIGNED_CALLBACKS;
    }
  });
});

describe("stripe webhook event parsing", () => {
  it("parses checkout.session.completed with integer cents metadata", () => {
    const event = parseStripeEvent(RAW_PAID_EVENT);
    expect(event?.type).toBe("checkout.session.completed");
    expect(event?.session).toMatchObject({
      sessionId: "cs_test_abc123",
      reference: "JO-TESTREF",
      ownerRef: OWNER,
      usdCents: 100,
      amountTotalCents: 100,
      currency: "USD",
      paymentStatus: "paid",
    });
  });

  it("returns null for a non-event body", () => {
    expect(parseStripeEvent("not json")).toBeNull();
    expect(parseStripeEvent('{"no":"type"}')).toBeNull();
  });
});

describe("stripe token credit (integer sen: 100 for $1.00)", () => {
  it("DERIVES 1,000,000 tokens for a $1 checkout", () => {
    expect(tokensForStripeSession(paidSession())).toBe(1_000_000);
  });

  it("scales linearly ($5 -> 5,000,000 tokens)", () => {
    expect(tokensForStripeSession(paidSession({ usdCents: 500, amountTotalCents: 500 }))).toBe(5_000_000);
  });

  it("records and credits: `credited: true` with 1,000,000 integer tokens", async () => {
    const { db, captured } = mockDb();
    const out = await recordStripeTopUp(db, paidSession());
    expect(out).toEqual({ recorded: true, credited: true, tokens: 1_000_000, replayed: false });
    expect(captured.topups).toHaveLength(1);
    expect(captured.topups[0]).toMatchObject({ provider: "stripe", provider_id: "stripe:cs_test_abc123", amount: 100 });
    expect(captured.ledger).toHaveLength(1);
    expect(captured.ledger[0]).toMatchObject({ visitor_key: OWNER, delta: 1_000_000, tokens: 1_000_000 });
  });

  it("REPLAYS a duplicate webhook as `credited: true, replayed: true`", async () => {
    let ledgerCalls = 0;
    const replayDb: StripeCreditDb = {
      from: (table: string) => ({
        upsert: async () => ({ error: table === "topups" ? null : { message: `unexpected table ${table}` } }),
        insert: async () => {
          ledgerCalls += 1;
          if (ledgerCalls === 1) return { error: { code: "23505", message: 'duplicate key value violates unique constraint "x"' } };
          return { error: null };
        },
      }),
    };
    const out = await recordStripeTopUp(replayDb, paidSession());
    expect(out).toEqual({ recorded: true, credited: true, tokens: 1_000_000, replayed: true });
  });

  it("fails closed on credit failure: `{recorded: true, credited: false}`", async () => {
    const { db } = mockDb(true);
    const out = await recordStripeTopUp(db, paidSession());
    expect(out).toEqual({ recorded: true, credited: false, reason: "credit_failed" });
  });

  it("fails closed without an owner: `{credited: false, reason: 'missing_owner'}`", async () => {
    const { db } = mockDb();
    const out = await recordStripeTopUp(db, paidSession({ ownerRef: null }));
    expect(out).toEqual({ recorded: true, credited: false, reason: "missing_owner" });
  });

  it("fails closed on a non-integer amount (a float must never reach bigint)", async () => {
    const { db, captured } = mockDb();
    const out = await recordStripeTopUp(db, paidSession({ usdCents: null, amountTotalCents: 1.5 as unknown as number }));
    expect(out).toEqual({ recorded: false, reason: "non_integer_amount" });
    expect(captured.topups).toHaveLength(0);
    expect(captured.ledger).toHaveLength(0);
  });
});

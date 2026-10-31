import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCurlecOrder,
  CURLEC_CURRENCY,
  CURLEC_MYR_PER_USD,
  formatMyr,
  INTERNATIONAL_SURCHARGE_BPS,
  InvalidCurlecEmailError,
  isInternationalCard,
  parseCurlecAmountMYR,
  parseCurlecEvent,
  quoteCurlecCharge,
  recordCurlecTopUp,
  tokensForCurlecBase,
  tokensForCurlecPayment,
  usdCentsForMyrSen,
  verifyCurlecWebhook,
  type CurlecCreditDb,
  type CurlecWebhookPayment,
} from "@/lib/payment/curlec";

/**
 * Curlec (Razorpay) Test Mode credit path.
 *
 * Boss spec: integer sen end to end — RM5.00 travels as `amount = 500` and
 * lands in the bigint `topups.amount` as 500, never the float 5.00. Tokens
 * credit on the BASE only: the 3% international surcharge is the gateway's
 * cut, not tokens.
 */

type Captured = { topups: Record<string, unknown>[]; ledger: Record<string, unknown>[] };

function mockDb(failLedgerOnce = false): {
  db: CurlecCreditDb;
  captured: Captured & { rpc: Array<{ fn: string; args: Record<string, unknown> }> };
  failWrites: { topups: boolean };
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
} {
  const captured: Captured & { rpc: Array<{ fn: string; args: Record<string, unknown> }> } = {
    topups: [],
    ledger: [],
    rpc: [],
  };
  const calls: { ledger: number } = { ledger: 0 };
  const failWrites = { topups: false };
  const rpcCalls = captured.rpc;
  type Chain = {
    select: (...a: unknown[]) => Chain;
    eq: (...a: unknown[]) => Chain;
    maybeSingle: () => Promise<{ data: { id: number } | null; error: null }>;
    upsert: () => Promise<{ error: { message: string } }>;
    insert: () => Promise<{ error: { message: string } }>;
  };
  const chain: Chain = {
    select: (..._a: unknown[]): Chain => chain,
    eq: (..._a: unknown[]): Chain => chain,
    maybeSingle: async () => ({ data: { id: 7 }, error: null }),
    upsert: async () => ({ error: { message: "unexpected table" } }),
    insert: async () => ({ error: { message: "unexpected table" } }),
  };
  const db: CurlecCreditDb = {
    from(table: string) {
      if (table === "referral_codes") {
        return {
          ...chain,
          maybeSingle: async () => ({ data: { id: 7 }, error: null }),
        };
      }
      if (table === "topups") {
        return {
          ...chain,
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
          ...chain,
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
      return chain;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { error: null, data: 2 };
    },
  };
  return { db, captured, failWrites, rpcCalls };
}

const OWNER = "3a8574f1d";

function paidPayment(partial?: Partial<CurlecWebhookPayment>): CurlecWebhookPayment {
  return {
    paymentId: "pay_test_abc123",
    orderId: "order_test_1",
    receipt: "JO-TESTREF",
    ownerRef: OWNER,
    email: "boss@jutaone.biz",
    totalSen: 500,
    currency: "MYR",
    baseSen: 500,
    surchargeSen: 0,
    tokens: 1060000,
    international: false,
    declaredInternational: false,
    method: "card",
    status: "captured",
    cardNetwork: "Visa",
    ...partial,
  };
}

/** Builds a real `X-Razorpay-Signature` header the verifier must accept. */
function signCurlecPayload(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

const RAW_PAID_EVENT = JSON.stringify({
  event: "order.paid",
  payload: {
    payment: {
      entity: {
        id: "pay_test_abc123",
        order_id: "order_test_1",
        amount: 500,
        currency: "MYR",
        method: "card",
        status: "captured",
        email: "boss@jutaone.biz",
        card: { network: "Visa", international: false, country: "MY" },
      },
    },
    order: {
      entity: {
        id: "order_test_1",
        receipt: "JO-TESTREF",
        amount: 500,
        currency: "MYR",
        notes: {
          owner_ref: OWNER,
          email: "boss@jutaone.biz",
          reference: "JO-TESTREF",
          base_sen: "500",
          surcharge_sen: "0",
          declared_international: "0",
          tokens: "1060000",
        },
      },
    },
  },
});

describe("curlec order creation (Test Mode)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CURLEC_KEY_ID;
    delete process.env.CURLEC_KEY_SECRET;
  });

  it("is unconfigured without keys (mock mode)", async () => {
    delete process.env.CURLEC_KEY_ID;
    delete process.env.CURLEC_KEY_SECRET;
    const { curlecConfigured } = await import("@/lib/payment/curlec");
    expect(curlecConfigured()).toBe(false);
  });

  it("returns a mock order (same shape, local redirect) when unconfigured", async () => {
    delete process.env.CURLEC_KEY_ID;
    const order = await createCurlecOrder(5, OWNER, "boss@jutaone.biz", {
      origin: "https://x.test",
      locale: "ms",
    });
    expect(order.mode).toBe("mock");
    expect(order.baseSen).toBe(500);
    expect(order.surchargeSen).toBe(0);
    expect(order.totalSen).toBe(500);
    expect(order.tokens).toBe(tokensForCurlecBase(500));
    expect(order.checkoutUrl).toContain("mode=mock");
  });

  it("throws InvalidCurlecEmailError instead of a dummy address", async () => {
    process.env.CURLEC_KEY_ID = "rzp_test_123";
    process.env.CURLEC_KEY_SECRET = "secret_test";
    await expect(createCurlecOrder(5, OWNER, "not-an-email")).rejects.toBeInstanceOf(InvalidCurlecEmailError);
    await expect(createCurlecOrder(5, OWNER, undefined)).rejects.toBeInstanceOf(InvalidCurlecEmailError);
  });

  it("posts integer sen to the Razorpay orders API (500 for RM5.00)", async () => {
    process.env.CURLEC_KEY_ID = "rzp_test_123";
    process.env.CURLEC_KEY_SECRET = "secret_test";
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      (async (_url: string, init?: { body?: unknown }) => {
        seen.push(String(init?.body ?? ""));
        return new Response(JSON.stringify({ id: "order_test_1" }), { status: 200 });
      }) as typeof fetch,
    );
    const order = await createCurlecOrder(5, OWNER, "boss@jutaone.biz");
    expect(order.mode).toBe("curlec");
    expect(order.orderId).toBe("order_test_1");
    const body = JSON.parse(seen[0] ?? "{}") as Record<string, unknown>;
    expect(body.amount).toBe(500);
    expect(body.currency).toBe(CURLEC_CURRENCY);
    expect(body.receipt).toBe(order.reference);
    expect((body.notes as Record<string, unknown>).owner_ref).toBe(OWNER);
  });

  it("locks +3% into the order when a foreign card is declared", async () => {
    process.env.CURLEC_KEY_ID = "rzp_test_123";
    process.env.CURLEC_KEY_SECRET = "secret_test";
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      (async (_url: string, init?: { body?: unknown }) => {
        seen.push(String(init?.body ?? ""));
        return new Response(JSON.stringify({ id: "order_test_2" }), { status: 200 });
      }) as typeof fetch,
    );
    const order = await createCurlecOrder(5, OWNER, "boss@jutaone.biz", { international: true });
    expect(order.totalSen).toBe(515);
    expect(order.surchargeSen).toBe(15);
    expect(order.tokens).toBe(tokensForCurlecBase(500));
    const body = JSON.parse(seen[0] ?? "{}") as Record<string, unknown>;
    expect(body.amount).toBe(515);
  });
});

describe("curlec surcharge quoting (transparent, base-only tokens)", () => {
  it("domestic cards pay no surcharge", () => {
    expect(quoteCurlecCharge(500, false)).toEqual({ baseSen: 500, surchargeSen: 0, totalSen: 500 });
  });

  it("foreign cards pay +3%: RM5.00 -> 15 sen surcharge, RM5.15 total", () => {
    expect(quoteCurlecCharge(500, true)).toEqual({ baseSen: 500, surchargeSen: 15, totalSen: 515 });
  });

  it("rounds the surcharge UP so the gateway cost is never under-collected", () => {
    // RM5.01 x 3% = 15.03 sen -> 16 sen, never 15.
    expect(quoteCurlecCharge(501, true)).toEqual({ baseSen: 501, surchargeSen: 16, totalSen: 517 });
  });

  it("fails closed on a non-integer base", () => {
    expect(quoteCurlecCharge(5.5, true)).toBeNull();
    expect(quoteCurlecCharge(null, true)).toBeNull();
  });
});

describe("curlec webhook signature verification", () => {
  const savedSecret = process.env.CURLEC_WEBHOOK_SECRET;
  const savedAllow = process.env.CURLEC_ALLOW_UNSIGNED_CALLBACKS;

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.CURLEC_WEBHOOK_SECRET;
    else process.env.CURLEC_WEBHOOK_SECRET = savedSecret;
    if (savedAllow === undefined) delete process.env.CURLEC_ALLOW_UNSIGNED_CALLBACKS;
    else process.env.CURLEC_ALLOW_UNSIGNED_CALLBACKS = savedAllow;
  });

  it("accepts a correctly signed payload", () => {
    process.env.CURLEC_WEBHOOK_SECRET = "whsec_test";
    const raw = '{"event":"order.paid"}';
    expect(verifyCurlecWebhook(raw, signCurlecPayload(raw, "whsec_test"))).toEqual({ ok: true });
  });

  it("rejects a tampered payload", () => {
    process.env.CURLEC_WEBHOOK_SECRET = "whsec_test";
    const header = signCurlecPayload('{"event":"order.paid"}', "whsec_test");
    expect(verifyCurlecWebhook('{"event":"order.refunded"}', header)).toEqual({
      ok: false,
      reason: "invalid_signature",
    });
  });

  it("rejects a missing signature header", () => {
    process.env.CURLEC_WEBHOOK_SECRET = "whsec_test";
    expect(verifyCurlecWebhook("{}", null)).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("fails closed without a webhook secret", () => {
    delete process.env.CURLEC_WEBHOOK_SECRET;
    delete process.env.CURLEC_ALLOW_UNSIGNED_CALLBACKS;
    expect(verifyCurlecWebhook("{}", "abc").ok).toBe(false);
  });

  it("only accepts unsigned callbacks with an explicit local opt-in", () => {
    delete process.env.CURLEC_WEBHOOK_SECRET;
    process.env.CURLEC_ALLOW_UNSIGNED_CALLBACKS = "1";
    try {
      expect(verifyCurlecWebhook("{}", null)).toEqual({ ok: true });
    } finally {
      delete process.env.CURLEC_ALLOW_UNSIGNED_CALLBACKS;
    }
  });
});

describe("curlec webhook event parsing", () => {
  it("parses order.paid with order notes and an actual card signal", () => {
    const event = parseCurlecEvent(RAW_PAID_EVENT);
    expect(event?.type).toBe("order.paid");
    expect(event?.payment).toMatchObject({
      paymentId: "pay_test_abc123",
      orderId: "order_test_1",
      receipt: "JO-TESTREF",
      ownerRef: OWNER,
      totalSen: 500,
      currency: "MYR",
      baseSen: 500,
      international: false,
      declaredInternational: false,
      status: "captured",
    });
  });

  it("flags an actual foreign card from the payment entity", () => {
    expect(isInternationalCard({ card: { international: true } })).toBe(true);
    expect(isInternationalCard({ international: true })).toBe(true);
    expect(isInternationalCard({ card: { country: "US" } })).toBe(true);
    expect(isInternationalCard({ card: { country: "MY" } })).toBe(false);
    expect(isInternationalCard({ method: "fpx" })).toBe(false);
    expect(isInternationalCard(null)).toBe(false);
  });

  it("returns null for a non-event body", () => {
    expect(parseCurlecEvent("not json")).toBeNull();
    expect(parseCurlecEvent('{"no":"event"}')).toBeNull();
  });
});

describe("curlec token math (RM4.70 = $1 anchor)", () => {
  it("anchors RM4.70 to $1.00: RM5.00 -> ~106c -> ~1,060,000 tokens", () => {
    expect(CURLEC_MYR_PER_USD).toBe(4.7);
    expect(INTERNATIONAL_SURCHARGE_BPS).toBe(300);
    expect(usdCentsForMyrSen(500)).toBe(106);
    expect(tokensForCurlecBase(500)).toBe(1_060_000);
    expect(tokensForCurlecPayment(paidPayment())).toBe(1060000);
  });

  it("derives tokens from the base when the notes grant is missing", () => {
    expect(tokensForCurlecPayment(paidPayment({ tokens: null }))).toBe(tokensForCurlecBase(500));
  });

  it("parses the MYR amount with $1-floor parity (RM4.70 min)", () => {
    expect(parseCurlecAmountMYR(4.7)).toBe(4.7);
    expect(parseCurlecAmountMYR(5)).toBe(5);
    expect(parseCurlecAmountMYR("10")).toBe(10);
    expect(parseCurlecAmountMYR(4.69)).toBeNull();
    expect(formatMyr(5)).toBe("RM5.00");
  });

  it("credits exactly 1,000,000 tokens for the RM4.70 floor (= $1.00)", () => {
    expect(usdCentsForMyrSen(470)).toBe(100);
    expect(tokensForCurlecBase(470)).toBe(1_000_000);
  });
});

describe("curlec token credit (integer sen: 500 for RM5.00)", () => {
  it("DERIVES ~1,060,000 tokens for an RM5 checkout (surcharge excluded)", () => {
    expect(tokensForCurlecPayment(paidPayment({ totalSen: 515, baseSen: 500, surchargeSen: 15 }))).toBe(1060000);
  });

  it("records and credits: `credited: true` with base-only integer tokens", async () => {
    const { db, captured, rpcCalls } = mockDb();
    const out = await recordCurlecTopUp(db, paidPayment());
    expect(out).toEqual({
      recorded: true,
      credited: true,
      tokens: 1060000,
      replayed: false,
      commissionLevels: 2,
      international: false,
    });
    expect(captured.topups).toHaveLength(1);
    expect(captured.topups[0]).toMatchObject({
      provider: "curlec",
      provider_id: "curlec:pay_test_abc123",
      amount: 500,
      currency: "MYR",
      base_amount: 500,
      base_currency: "MYR",
    });
    expect(captured.ledger).toHaveLength(1);
    expect(captured.ledger[0]).toMatchObject({ visitor_key: OWNER, delta: 1060000, tokens: 1060000 });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({
      fn: "jutaone_distribute_commission",
      args: {
        p_source: "topup",
        p_from_code_id: 7,
        p_gross_minor: 106,
        p_currency: "USD",
      },
    });
  });

  it("flags a surcharge mismatch (declared domestic, actual foreign card)", async () => {
    const { db } = mockDb();
    const out = await recordCurlecTopUp(db, paidPayment({ international: true, declaredInternational: false }));
    expect(out).toMatchObject({ recorded: true, credited: true, surchargeMismatch: true, international: true });
  });

  it("REPLAYS a duplicate webhook as `credited: true, replayed: true`", async () => {
    let ledgerCalls = 0;
    const base = {
      select: (..._a: unknown[]) => base,
      eq: (..._a: unknown[]) => base,
      maybeSingle: async () => ({ data: { id: 7 }, error: null }),
      upsert: async () => ({ error: { message: "unexpected" } }),
      insert: async () => ({ error: { message: "unexpected" } }),
    };
    const replayDb: CurlecCreditDb = {
      from: (table: string) => {
        if (table === "topups") {
          return {
            ...base,
            upsert: async () => ({ error: null }),
          };
        }
        return {
          ...base,
          insert: async () => {
            ledgerCalls += 1;
            if (ledgerCalls === 1)
              return { error: { code: "23505", message: 'duplicate key value violates unique constraint "x"' } };
            return { error: null };
          },
        };
      },
      rpc: async () => ({ error: null, data: 2 }),
    };
    const out = await recordCurlecTopUp(replayDb, paidPayment());
    expect(out).toEqual({ recorded: true, credited: true, tokens: 1060000, replayed: true });
  });

  it("fails closed on credit failure: `{recorded: true, credited: false}`", async () => {
    const { db } = mockDb(true);
    const out = await recordCurlecTopUp(db, paidPayment());
    expect(out).toEqual({ recorded: true, credited: false, reason: "credit_failed" });
  });

  it("fails closed without an owner: `{credited: false, reason: 'missing_owner'}`", async () => {
    const { db } = mockDb();
    const out = await recordCurlecTopUp(db, paidPayment({ ownerRef: null }));
    expect(out).toEqual({ recorded: true, credited: false, reason: "missing_owner" });
  });

  it("fails closed on a non-integer amount (a float must never reach bigint)", async () => {
    const { db, captured } = mockDb();
    const out = await recordCurlecTopUp(db, paidPayment({ totalSen: 5.5 as unknown as number }));
    expect(out).toEqual({ recorded: false, reason: "non_integer_amount" });
    expect(captured.topups).toHaveLength(0);
    expect(captured.ledger).toHaveLength(0);
  });
});

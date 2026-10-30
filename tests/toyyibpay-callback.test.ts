import { describe, expect, it } from "vitest";
import { parseToyyibReference, resolveToyyibAmountSen, toIntegerSen } from "@/lib/payment/toyyibpay";
import {
  buildToyyibTopUpRow,
  recordToyyibTopUp,
  tokensForToyyibRef,
  type ToyyibCreditDb,
} from "@/lib/payment/toyyib-credit";

/** Minimal shape of the database the credit path touches. */
type MockDb = ToyyibCreditDb;

/**
 * Boss live case: vendor posts RM ("5.70"), bigint columns want sen (570).
 * A float reaching the upsert fails it (`invalid input syntax for type
 * bigint: "5.70"`) and the webhook answers 200 `{recorded:false}` while
 * crediting nothing — so `token_ledger` never gets its 1,000,000 tokens.
 */

type Captured = { topups: Record<string, unknown>[]; ledger: Record<string, unknown>[] };

function mockDb(failLedgerOnce = false): {
  db: MockDb;
  captured: Captured;
  failWrites: { topups: boolean };
} {
  const captured: Captured = { topups: [], ledger: [] };
  const calls: { ledger: number } = { ledger: 0 };
  const failWrites = { topups: false };
  const db: MockDb = {
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

describe("toyyib callback integer-sen parsing (Boss live bill)", () => {
  it("resolves RM floats to integer sen, never a float", () => {
    const ref = parseToyyibReference(`JO-MVUC9UAL;rm=470;fee=100;usd=100;owner=${OWNER}`);
    expect(ref).toEqual({ baseSen: 470, feeSen: 100, usdCents: 100, ownerRef: OWNER });
    expect(resolveToyyibAmountSen("5.70", ref)).toBe(570);
    expect(resolveToyyibAmountSen("RM5.70", ref)).toBe(570);
    expect(resolveToyyibAmountSen("5.70", { baseSen: null, feeSen: null })).toBe(570);
    expect(resolveToyyibAmountSen("4.70", { baseSen: null, feeSen: 0 })).toBe(470);
    expect(resolveToyyibAmountSen(null, { baseSen: null, feeSen: null })).toBeNull();
  });

  it("toIntegerSen coerces every input shape to integer sen or null", () => {
    expect(toIntegerSen("5.70")).toBe(570);
    expect(toIntegerSen("RM5.70")).toBe(570);
    expect(toIntegerSen(5.7)).toBe(570);
    expect(toIntegerSen("0")).toBeNull();
    expect(toIntegerSen("")).toBeNull();
    expect(toIntegerSen("abc")).toBeNull();
    expect(toIntegerSen(null)).toBeNull();
    expect(toIntegerSen(undefined)).toBeNull();
  });

  it("DERIVES 1,000,000 tokens for a $1 top-up on the base only", () => {
    const ref = parseToyyibReference(`JO-MVUC9UAL;rm=470;fee=100;usd=100;owner=${OWNER}`);
    expect(tokensForToyyibRef(ref)).toBe(1_000_000);
  });

  it("builds an integer-only topups row from a Boss-style callback", () => {
    const ref = parseToyyibReference(`JO-MVUC9UAL;rm=470;fee=100;usd=100;owner=${OWNER}`);
    const built = buildToyyibTopUpRow({ amount: "5.70", billcode: "47w1g0jx" }, ref);
    expect(built).toEqual({
      ok: true,
      row: { providerId: "toyyib:47w1g0jx", amountSen: 570, baseSen: 470 },
    });
    if (built.ok) {
      expect(Number.isSafeInteger(built.row.amountSen)).toBe(true);
      expect(Number.isSafeInteger(built.row.baseSen)).toBe(true);
    }
  });

  it("records and credits: `credited: true` with 1,000,000 integer tokens", async () => {
    const { db, captured } = mockDb();
    const ref = parseToyyibReference(`JO-MVUC9UAL;rm=470;fee=100;usd=100;owner=${OWNER}`);
    const out = await recordToyyibTopUp(
      db,
      { refno: "REF1", orderId: "OID1", hash: "h", status: "1", billcode: "47w1g0jx", amount: "5.70", reason: null },
      ref,
    );
    expect(out).toEqual({ recorded: true, credited: true, tokens: 1_000_000, replayed: false, feeSen: 100 });
    expect(captured.topups).toHaveLength(1);
    expect(captured.topups[0]).toMatchObject({ amount: 570, base_amount: 470 });
    expect(captured.ledger).toHaveLength(1);
    expect(captured.ledger[0]).toMatchObject({ visitor_key: OWNER, delta: 1_000_000, tokens: 1_000_000 });
  });

  it("REPLAYS a duplicate ledger credit as `credited: true, replayed: true`", async () => {
    const ref = parseToyyibReference(`JO-MVUC9UAL;rm=470;fee=100;usd=100;owner=${OWNER}`);
    const callback = {
      refno: "REF1",
      orderId: "OID1",
      hash: "h",
      status: "1",
      billcode: "47w1g0jx",
      amount: "5.70",
      reason: null,
    } as const;
    let ledgerCalls = 0;
    const replayDb: MockDb = {
      from: (table: string) => ({
        upsert: async () => ({ error: table === "topups" ? null : { message: `unexpected table ${table}` } }),
        insert: async () => {
          ledgerCalls += 1;
          if (ledgerCalls === 1) return { error: { code: "23505", message: 'duplicate key value violates unique constraint "x"' } };
          return { error: null };
        },
      }),
    };
    const out = await recordToyyibTopUp(replayDb, { ...callback }, ref);
    expect(out).toEqual({ recorded: true, credited: true, tokens: 1_000_000, replayed: true });
  });

  it("fails closed on credit failure: `{recorded: true, credited: false}`", async () => {
    const { db } = mockDb(true);
    const ref = parseToyyibReference(`JO-MVUC9UAL;rm=470;fee=100;usd=100;owner=${OWNER}`);
    const out = await recordToyyibTopUp(
      db,
      { refno: "REF1", orderId: "OID1", hash: "h", status: "1", billcode: "47w1g0jx", amount: "5.70", reason: null },
      ref,
    );
    expect(out).toEqual({ recorded: true, credited: false, reason: "credit_failed" });
  });

  it("fails closed without an owner: `{credited: false, reason: 'missing_owner'}`", async () => {
    const { db } = mockDb();
    const ref = parseToyyibReference("JO-X;rm=470;fee=100;usd=100");
    const out = await recordToyyibTopUp(
      db,
      { refno: "REF1", orderId: "OID1", hash: "h", status: "1", billcode: "47w1g0jx", amount: "5.70", reason: null },
      ref,
    );
    expect(out).toEqual({ recorded: true, credited: false, reason: "missing_owner" });
  });
});

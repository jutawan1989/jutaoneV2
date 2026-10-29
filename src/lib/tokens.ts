import { getSupabase } from "@/lib/db";

/**
 * Token balance and metered spending.
 *
 * A balance is a sum over `token_ledger`, never a mutable counter, so history
 * cannot be rewritten. Spending is recorded with a caller-supplied reference and
 * the database enforces uniqueness on it: a retried request (client timeout,
 * double-click, proxy retry) must not charge twice for one action.
 */

/** Cost of one metered action, in tokens. */
export const SEARCH_COST_TOKENS = 10_000;

/** Cost of one Smart Assistant answer, in tokens. */
export const CHAT_COST_TOKENS = 5_000;

/**
 * Member price of one AI Ad generation, in tokens (Boss spec: "Tolak 20,000
 * Token"). Displayed on the dashboard Alat AI card; the charge itself is
 * enforced server-side in `/api/demo` member mode.
 */
export const AD_COST_TOKENS = 20_000;

/** Cost of one live Metals (gold/silver) quote, in tokens. */
export const METALS_COST_TOKENS = 2_000;

export const ledgerConfigured = (): boolean => Boolean(getSupabase());

/** Current balance, or 0 when the visitor has no ledger rows yet. */
export async function getTokenBalance(visitorKey: string): Promise<number> {
  const db = getSupabase();
  if (!db) return 0;

  const { data, error } = await db.rpc("jutaone_token_balance", {
    target_visitor: visitorKey,
  });
  if (error) {
    console.error("[jutaone] balance read failed", error.message);
    return 0;
  }
  return Number(data ?? 0);
}

export type SpendResult =
  | { ok: true; charged: boolean; balanceAfter: number; replayed: boolean }
  | { ok: false; reason: "insufficient" | "ledger_error" };

/**
 * Charges `cost` tokens for one action.
 *
 * Called *after* the metered work succeeds, so a failed or empty search is free.
 * The overdraw check is in the database guard, not here: a read-then-write in
 * application code loses a race between two concurrent requests, while the
 * guard's advisory lock does not.
 */
export async function chargeTokens(input: {
  visitorKey: string;
  cost: number;
  /** Unique per action; makes a retry a no-op instead of a second charge. */
  reference: string;
  note?: string;
}): Promise<SpendResult> {
  const db = getSupabase();
  if (!db) return { ok: false, reason: "ledger_error" };

  const { error } = await db.from("token_ledger").insert({
    visitor_key: input.visitorKey,
    delta: -Math.abs(input.cost),
    reason: "spend",
    spend_ref: input.reference,
    tokens: Math.abs(input.cost),
  });

  if (error) {
    // The guard raises this when the balance would go negative.
    if (/insufficient token balance/i.test(error.message)) {
      return { ok: false, reason: "insufficient" };
    }
    // A replay hits the unique index on spend_ref: already charged, not an error.
    if (error.code === "23505" || /duplicate key/i.test(error.message)) {
      return {
        ok: true,
        charged: false,
        balanceAfter: await getTokenBalance(input.visitorKey),
        replayed: true,
      };
    }
    console.error("[jutaone] token spend failed", error.message);
    return { ok: false, reason: "ledger_error" };
  }

  return {
    ok: true,
    charged: true,
    balanceAfter: await getTokenBalance(input.visitorKey),
    replayed: false,
  };
}

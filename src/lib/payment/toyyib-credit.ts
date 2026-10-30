import { TOKENS_PER_USD } from "@/lib/pricing";
import {
  parseToyyibReference,
  resolveToyyibAmountSen,
  type ToyyibCallback,
} from "@/lib/payment/toyyibpay";

/**
 * Minimal database surface this module writes, narrowed to the two calls it
 * makes. Callers pass the real client cast through this interface; the
 * Supabase query builders resolve to `{ error }`, which is all that is read.
 */
export type ToyyibCreditDb = {
  from(table: string): {
    upsert: (
      row: Record<string, unknown>,
      opts?: Record<string, unknown>,
    ) => PromiseLike<{ error: { code?: string; message: string } | null }>;
    insert: (
      row: Record<string, unknown>,
    ) => PromiseLike<{ error: { code?: string; message: string } | null }>;
  };
};

type Db = ToyyibCreditDb;
type ParsedRef = ReturnType<typeof parseToyyibReference>;

export type ToyyibTopUpRow = {
  providerId: string;
  /** Integer sen for the bigint `topups.amount`, or null when unknown. */
  amountSen: number | null;
  /** Integer sen for `topups.base_amount`, or null when unknown. */
  baseSen: number | null;
};

/**
 * Builds the `topups` row values for a verified ToyyibPay callback.
 *
 * Integer guarantee: both sen values pass through `Math.round` and a safe
 * integer check. A non-integer here used to reach the bigint upsert as a
 * float ("5.70") and fail the whole callback with `{recorded:false}` while
 * answering HTTP 200 — tokens never credited. This fails closed
 * (`ok:false`) instead of writing a float.
 */
export function buildToyyibTopUpRow(
  callback: Pick<ToyyibCallback, "amount" | "billcode">,
  ref: ParsedRef,
): { ok: true; row: ToyyibTopUpRow } | { ok: false; reason: string } {
  const providerId = `toyyib:${callback.billcode}`;
  const amountSen = resolveToyyibAmountSen(callback.amount, ref);
  const baseSen = ref.baseSen;

  // `resolveToyyibAmountSen` already rounds, so this is a second lock on the
  // same door: a float must never reach a bigint column.
  const safeAmount = amountSen === null ? null : Math.round(amountSen);
  const safeBase = baseSen === null ? null : Math.round(baseSen);
  if (safeAmount !== null && (!Number.isSafeInteger(safeAmount) || safeAmount <= 0)) {
    return { ok: false, reason: "non_integer_amount" };
  }
  if (safeBase !== null && (!Number.isSafeInteger(safeBase) || safeBase <= 0)) {
    return { ok: false, reason: "non_integer_base" };
  }
  return { ok: true, row: { providerId, amountSen: safeAmount, baseSen: safeBase } };
}

/** Token credit for a verified callback. Base only: the RM1.00 fee is ToyyibPay's cut. */
export function tokensForToyyibRef(ref: ParsedRef): number | null {
  const usdCents = ref.usdCents ?? 100;
  const tokens = Math.round((usdCents / 100) * TOKENS_PER_USD);
  if (!Number.isSafeInteger(tokens) || tokens <= 0) return null;
  return tokens;
}

/**
 * Records a verified ToyyibPay callback: one `topups` row (idempotent on
 * `provider_id`) plus one `token_ledger` credit (idempotent on `spend_ref`).
 *
 * Moved out of the route module so tests can exercise the exact write path
 * with a mock database — importing the route would drag in Next.js server
 * runtime, which has no place in a unit test.
 */
export async function recordToyyibTopUp(
  db: Db,
  callback: ToyyibCallback,
  ref: ParsedRef,
): Promise<Record<string, unknown>> {
  const built = buildToyyibTopUpRow(callback, ref);
  if (!built.ok) {
    console.error("[jutaone] toyyib topup amount not integer-safe", built.reason, {
      providerId: `toyyib:${callback.billcode}`,
      amount: callback.amount,
    });
    return { recorded: false };
  }
  const { providerId, amountSen, baseSen } = built.row;
  const { error } = await db.from("topups").upsert(
    {
      provider: "toyyibpay",
      provider_id: providerId,
      reference: callback.orderId ?? callback.refno,
      status: "paid",
      amount: amountSen,
      currency: "MYR",
      base_amount: baseSen,
      base_currency: "MYR",
      fx_rate: null,
    },
    { onConflict: "provider_id" },
  );
  if (error || !callback.billcode) {
    console.error("[jutaone] toyyib topup record failed", error?.message ?? "missing billcode", {
      providerId,
      amount: callback.amount,
    });
    return { recorded: false };
  }
  if (!ref.ownerRef) return { recorded: true, credited: false, reason: "missing_owner" };

  // Tokens credit on the BASE only: the RM1.00 fee is ToyyibPay's cut, not
  // tokens. usdCents in the ref is exact, so no FX re-derivation is needed.
  const tokens = tokensForToyyibRef(ref);
  if (tokens === null) {
    return { recorded: true, credited: false, reason: "invalid_amount" };
  }

  const { error: ledgerError } = await db.from("token_ledger").insert({
    visitor_key: ref.ownerRef,
    delta: tokens,
    reason: "topup",
    spend_ref: providerId,
    tokens,
  });
  if (ledgerError) {
    if (ledgerError.code === "23505" || /duplicate key/i.test(ledgerError.message)) {
      return { recorded: true, credited: true, tokens, replayed: true };
    }
    console.error("[jutaone] toyyib ledger credit failed", ledgerError.message, {
      providerId,
      ownerRef: ref.ownerRef,
      tokens,
    });
    return { recorded: true, credited: false, reason: "credit_failed" };
  }
  return { recorded: true, credited: true, tokens, replayed: false, feeSen: ref.feeSen ?? 100 };
}

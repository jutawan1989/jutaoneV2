import { getSupabase } from "@/lib/db";
import { TOKENS_PER_USD } from "@/lib/pricing";

export type GrantResult =
  | { ok: true; tokens: number; alreadyGranted: boolean }
  | { ok: false; reason: string };

/**
 * Credits tokens for a paid top-up, exactly once.
 *
 * The database is the source of truth for idempotency (`token_ledger_topup_grant_key`
 * plus the guard trigger), so this reads the row back rather than trusting its
 * own success: a replayed Chip webhook returns `alreadyGranted` instead of
 * crediting twice, and two concurrent deliveries cannot both win.
 *
 * Tokens are derived from the USD base recorded on the top-up, never from the
 * local amount: a customer who paid RM23.50 for $5 gets exactly 5,000,000.
 */
export async function grantTokensForTopUp(topup: {
  id: number;
  visitorKey: string;
  baseUsdCents: number | null;
  tokens: number | null;
}): Promise<GrantResult> {
  const db = getSupabase();
  if (!db) return { ok: false, reason: "supabase_not_configured" };

  const tokens =
    topup.tokens ??
    (topup.baseUsdCents !== null
      ? Math.round((topup.baseUsdCents / 100) * TOKENS_PER_USD)
      : null);

  if (tokens === null || tokens <= 0) {
    return { ok: false, reason: "topup_has_no_token_amount" };
  }

  const { error } = await db.from("token_ledger").insert({
    visitor_key: topup.visitorKey,
    delta: tokens,
    reason: "topup",
    topup_id: topup.id,
    base_usd_cents: topup.baseUsdCents,
    tokens,
  });

  if (error) {
    // The unique index on (topup_id) where reason='topup' is the replay guard.
    if (error.code === "23505" || /already been credited/i.test(error.message)) {
      return { ok: true, tokens, alreadyGranted: true };
    }
    return { ok: false, reason: error.message };
  }

  return { ok: true, tokens, alreadyGranted: false };
}

/** Current balance for a visitor, or 0 when there is no ledger row yet. */
export async function getTokenBalance(visitorKey: string): Promise<number> {
  const db = getSupabase();
  if (!db) return 0;

  const { data, error } = await db.rpc("jutaone_token_balance", {
    target_visitor: visitorKey,
  });
  if (error || data === null) return 0;
  return Number(data);
}

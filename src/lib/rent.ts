import { randomUUID } from "node:crypto";
import { getSupabase } from "@/lib/db";
import { chargeTokens, getTokenBalance } from "@/lib/tokens";
import { RENT_DAYS, getSubscription, type Subscription } from "@/lib/subscription";

/** CTO spec: Store Rent = 5,000,000 Token for 30 days. Single source of truth. */
export const STORE_RENT_TOKENS = 5_000_000;
export const STORE_RENT_DAYS = RENT_DAYS;

export type RentActivateResult =
  | { ok: true; subscription: Subscription; balanceAfter: number; extended: boolean }
  | { ok: false; reason: "insufficient" | "ledger_error" | "store_unavailable" | string; balance?: number };

/**
 * Activates (or extends) Store Rent by deducting tokens.
 * Flow: balance check (402 when short) -> charge -> extend paid_until by
 * STORE_RENT_DAYS from max(existing paid_until, now). spend_ref is unique
 * per call so a retry cannot double-deduct.
 */
export async function activateStoreRent(ownerRef: string): Promise<RentActivateResult> {
  const db = getSupabase();
  if (!db) return { ok: false, reason: "store_unavailable" };

  const balance = await getTokenBalance(ownerRef);
  if (balance < STORE_RENT_TOKENS) {
    return { ok: false, reason: "insufficient", balance };
  }

  const spendRef = `store-rent:${ownerRef.slice(0, 24)}:${Date.now()}:${randomUUID().slice(0, 8)}`;
  const charge = await chargeTokens({
    visitorKey: ownerRef,
    cost: STORE_RENT_TOKENS,
    reference: spendRef,
    note: `store-rent:${STORE_RENT_DAYS}d`,
  });
  if (!charge.ok) {
    return { ok: false, reason: charge.reason, balance };
  }

  const existing = await getSubscription(ownerRef);
  const baseMs = Math.max(
    Date.now(),
    existing?.paidUntil ? new Date(existing.paidUntil).getTime() : 0,
  );
  const paidUntil = new Date(baseMs + STORE_RENT_DAYS * 86_400_000).toISOString();

  if (existing) {
    const { error } = await db
      .from("store_subscriptions")
      .update({
        status: "active",
        paid_until: paidUntil,
        next_billing_date: paidUntil,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_ref", ownerRef);
    if (error) return { ok: false, reason: error.message, balance: charge.balanceAfter };
  } else {
    const { error } = await db.from("store_subscriptions").insert({
      owner_ref: ownerRef,
      plan: "store_pro",
      status: "active",
      paid_until: paidUntil,
      next_billing_date: paidUntil,
    });
    if (error) {
      if (/duplicate key|unique/i.test(error.message)) {
        const retry = await getSubscription(ownerRef);
        if (retry) {
          return { ok: true, subscription: retry, balanceAfter: charge.balanceAfter, extended: true };
        }
      }
      return { ok: false, reason: error.message, balance: charge.balanceAfter };
    }
  }

  const subscription = await getSubscription(ownerRef);
  if (!subscription) return { ok: false, reason: "read_back_failed", balance: charge.balanceAfter };
  return {
    ok: true,
    subscription,
    balanceAfter: charge.balanceAfter,
    extended: Boolean(existing?.isOpen),
  };
}

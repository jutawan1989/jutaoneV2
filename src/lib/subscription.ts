import { getSupabase } from "@/lib/db";

/**
 * Store Rent state — token-only (CTO spec): 5,000,000 Token = 30 hari.
 *
 * No Stripe, no Chip, no trial. Rent is a token deduction, never a card
 * payment. Legacy trial/checkout code is CLOSED (see TASK 1 routes).
 */

export const RENT_DAYS = 30;

export type SubscriptionStatus = "trial" | "active" | "past_due" | "cancelled";

export type Subscription = {
  id: string;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  nextBillingDate: string | null;
  paidUntil: string | null;
  isOpen: boolean;
  /** Whole days left in the trial; null when not on trial. */
  trialDaysLeft: number | null;
};

type Row = {
  id: string;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  next_billing_date: string | null;
  paid_until: string | null;
};

export async function getSubscription(ownerRef: string): Promise<Subscription | null> {
  const db = getSupabase();
  if (!db) return null;

  const { data, error } = await db
    .from("store_subscriptions")
    .select("id, status, trial_ends_at, next_billing_date, paid_until")
    .eq("owner_ref", ownerRef)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Row;

  // Entitlement is evaluated at read time, so a lapsed trial closes the shop
  // immediately instead of whenever a sweep next runs.
  const now = Date.now();
  const trialEnds = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : null;
  const paidUntil = row.paid_until ? new Date(row.paid_until).getTime() : null;

  const isOpen =
    (row.status === "trial" && trialEnds !== null && trialEnds > now) ||
    (row.status === "active" && (paidUntil === null || paidUntil > now));

  const trialDaysLeft =
    row.status === "trial" && trialEnds !== null
      ? Math.max(0, Math.ceil((trialEnds - now) / 86_400_000))
      : null;

  return {
    id: row.id,
    status: row.status,
    trialEndsAt: row.trial_ends_at,
    nextBillingDate: row.next_billing_date,
    paidUntil: row.paid_until,
    isOpen,
    trialDaysLeft,
  };
}

/** CLOSED by CTO directive (TASK 1): 7-day trial removed. Kept as a stub. */
export async function startTrial(
  _ownerRef: string,
): Promise<{ ok: true; subscription: Subscription } | { ok: false; reason: string }> {
  return { ok: false, reason: "trial_closed" };
}

/**
 * Canonical token-rent activation lives in `src/lib/rent.ts`
 * (`activateStoreRent`, via POST /api/store/activate). This module keeps
 * subscription state reads (`getSubscription`); the duplicate charge path
 * was removed so there is exactly one place that deducts rent.
 */

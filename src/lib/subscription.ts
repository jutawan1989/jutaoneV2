import { getSupabase } from "@/lib/db";

/**
 * Store Rent pricing and subscription state.
 *
 * Rent is a separate product from tokens: $5.00/month, billed in the visitor's
 * local currency the same way a top-up is, with a 7-day trial.
 */

export const RENT_USD_CENTS = 500;
export const TRIAL_DAYS = 7;
/** Billing period granted by one payment. */
export const RENT_DAYS = 30;
/** Rough local estimates for the modal, at the same FX the top-up flow uses. */
export const RENT_LOCAL_HINT = { MY: "RM23.50", ID: "Rp80,000" } as const;

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

/**
 * Starts the trial.
 *
 * Client-supplied dates are ignored: the end date is computed here, and the
 * unique index on `owner_ref` means a merchant cannot restart the clock by
 * calling this again.
 */
export async function startTrial(
  ownerRef: string,
): Promise<{ ok: true; subscription: Subscription } | { ok: false; reason: string }> {
  const db = getSupabase();
  if (!db) return { ok: false, reason: "supabase_not_configured" };

  const existing = await getSubscription(ownerRef);
  if (existing) {
    // A merchant who already trialled or subscribed cannot trial again.
    return { ok: false, reason: "already_subscribed" };
  }

  const trialEnds = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString();

  const { error } = await db
    .from("store_subscriptions")
    .insert({
      owner_ref: ownerRef,
      plan: "store_pro",
      status: "trial",
      trial_ends_at: trialEnds,
      next_billing_date: trialEnds,
    })
    .select("id, status, trial_ends_at, next_billing_date, paid_until")
    .single();

  if (error) {
    const taken = /duplicate key|unique/i.test(error.message);
    return { ok: false, reason: taken ? "already_subscribed" : error.message };
  }

  const subscription = await getSubscription(ownerRef);
  return subscription ? { ok: true, subscription } : { ok: false, reason: "read_back_failed" };
}

import { getSupabase } from "@/lib/db";

/**
 * Everything the member dashboard shows, in one place.
 *
 * All four tabs read from a single `loadMemberOverview` call so the page makes
 * one round trip instead of four sequential ones: on a phone in a shop, four
 * waterfalls is the difference between "fast" and "broken".
 */

export type MemberOverview = {
  tokens: number;
  affiliate: {
    code: string | null;
    directMinor: number;
    passiveMinor: number;
    availableMinor: number;
    networkSize: number;
    currency: string;
  };
  store: {
    slug: string | null;
    productCount: number;
    subscriptionStatus: string | null;
    isOpen: boolean;
    trialDaysLeft: number | null;
    paidUntil: string | null;
  };
};

export async function loadMemberOverview(ownerRef: string): Promise<MemberOverview> {
  const db = getSupabase();
  const empty: MemberOverview = {
    tokens: 0,
    affiliate: {
      code: null,
      directMinor: 0,
      passiveMinor: 0,
      availableMinor: 0,
      networkSize: 0,
      currency: "MYR",
    },
    store: {
      slug: null,
      productCount: 0,
      subscriptionStatus: null,
      isOpen: false,
      trialDaysLeft: null,
      paidUntil: null,
    },
  };
  if (!db) return empty;

  const [{ data: tokenBalance }, { data: codeRow }, { data: products }, { data: sub }] =
    await Promise.all([
      db.rpc("jutaone_token_balance", { target_visitor: ownerRef }),
      db.from("referral_codes").select("id, code").eq("owner_ref", ownerRef).maybeSingle(),
      db
        .from("merchant_products")
        .select("shop_slug")
        .eq("owner_ref", ownerRef)
        .eq("active", true)
        .limit(1),
      db
        .from("store_subscriptions")
        .select("status, trial_ends_at, paid_until")
        .eq("owner_ref", ownerRef)
        .maybeSingle(),
    ]);

  const tokens = Number(tokenBalance ?? 0);
  const slug = (products?.[0]?.shop_slug as string | undefined) ?? null;

  // Entitlement mirrors `jutaone_store_is_open`: no subscription row means open,
  // which keeps stores that predate the rent feature visible.
  const now = Date.now();
  const trialEnds = sub?.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : null;
  const paidUntil = sub?.paid_until ? new Date(sub.paid_until).getTime() : null;
  const status = (sub?.status as string | undefined) ?? null;
  const isOpen =
    status === null ||
    (status === "trial" && trialEnds !== null && trialEnds > now) ||
    (status === "active" && (paidUntil === null || paidUntil > now));

  let networkSize = 0;
  let directMinor = 0;
  let passiveMinor = 0;
  let availableMinor = 0;
  let currency = "MYR";
  let code: string | null = null;

  if (codeRow) {
    code = codeRow.code as string;
    const [{ data: counts }, { data: balance }] = await Promise.all([
      db.rpc("jutaone_network_counts", { p_code_id: codeRow.id }),
      db
        .from("affiliate_balances")
        .select("available_minor, currency")
        .eq("referral_code_id", codeRow.id)
        .limit(1),
    ]);

    for (const row of (counts ?? []) as Array<{
      level: number;
      people: number;
      passive_earnings_minor: number | string;
    }>) {
      networkSize += Number(row.people);
      const earned = Number(row.passive_earnings_minor ?? 0);
      if (Number(row.level) === 1) directMinor += earned;
      else passiveMinor += earned;
    }
    availableMinor = Number(balance?.[0]?.available_minor ?? 0);
    currency = (balance?.[0]?.currency as string | undefined) ?? "MYR";
  }

  return {
    tokens,
    affiliate: { code, directMinor, passiveMinor, availableMinor, networkSize, currency },
    store: {
      slug,
      productCount: slug ? 1 : 0,
      subscriptionStatus: status,
      isOpen,
      trialDaysLeft:
        status === "trial" && trialEnds !== null
          ? Math.max(0, Math.ceil((trialEnds - now) / 86_400_000))
          : null,
      paidUntil: (sub?.paid_until as string | undefined) ?? null,
    },
  };
}

export type MemberPayout = {
  id: number;
  currency: string;
  amountMinor: number;
  status: string;
  requestedAt: string;
  paidAt: string | null;
};

export async function loadMemberPayouts(ownerRef: string): Promise<MemberPayout[]> {
  const db = getSupabase();
  if (!db) return [];

  const { data: codeRow } = await db
    .from("referral_codes")
    .select("id")
    .eq("owner_ref", ownerRef)
    .maybeSingle();
  if (!codeRow) return [];

  const { data } = await db
    .from("payout_requests")
    .select("id, currency, amount_minor, status, requested_at, paid_at")
    .eq("referral_code_id", codeRow.id)
    .order("requested_at", { ascending: false })
    .limit(20);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id),
    currency: row.currency as string,
    amountMinor: Number(row.amount_minor),
    status: row.status as string,
    requestedAt: row.requested_at as string,
    paidAt: (row.paid_at as string | null) ?? null,
  }));
}

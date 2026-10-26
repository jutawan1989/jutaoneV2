import { getSupabase } from "@/lib/db";

/**
 * Read model for the admin panel.
 *
 * Everything here is aggregate or operational: no customer addresses, no
 * passwords, no card data. The admin needs to know money moved and who is owed;
 * it does not need the merchant's customer list.
 */

export type AdminStats = {
  members: number;
  stores: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  tokenTopUps: number;
  topUpVolumeMinor: number;
  pendingPayouts: number;
  pendingPayoutVolumeMinor: number;
};

export type AdminMember = {
  email: string;
  ownerRef: string;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
  tokens: number;
  storeSlug: string | null;
  storeStatus: string | null;
  storeOpen: boolean;
};

export type AdminPayout = {
  id: number;
  code: string;
  currency: string;
  amountMinor: number;
  status: string;
  requestedAt: string;
  paidAt: string | null;
  note: string | null;
};

export async function loadAdminStats(): Promise<AdminStats> {
  const db = getSupabase();
  const empty: AdminStats = {
    members: 0,
    stores: 0,
    activeSubscriptions: 0,
    trialSubscriptions: 0,
    tokenTopUps: 0,
    topUpVolumeMinor: 0,
    pendingPayouts: 0,
    pendingPayoutVolumeMinor: 0,
  };
  if (!db) return empty;

  const [members, subs, topups, payouts] = await Promise.all([
    db.from("members").select("id", { count: "exact", head: true }),
    db.from("store_subscriptions").select("status"),
    db.from("topups").select("amount").eq("status", "paid"),
    db.from("payout_requests").select("amount_minor").in("status", ["requested", "approved"]),
  ]);

  const subRows = (subs.data ?? []) as Array<{ status: string }>;
  const topupRows = (topups.data ?? []) as Array<{ amount: number | string | null }>;
  const payoutRows = (payouts.data ?? []) as Array<{ amount_minor: number | string }>;

  return {
    members: members.count ?? 0,
    stores: subRows.length,
    activeSubscriptions: subRows.filter((s) => s.status === "active").length,
    trialSubscriptions: subRows.filter((s) => s.status === "trial").length,
    tokenTopUps: topupRows.length,
    topUpVolumeMinor: topupRows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
    pendingPayouts: payoutRows.length,
    pendingPayoutVolumeMinor: payoutRows.reduce((sum, r) => sum + Number(r.amount_minor ?? 0), 0),
  };
}

export async function loadAdminMembers(limit = 100): Promise<AdminMember[]> {
  const db = getSupabase();
  if (!db) return [];

  const { data: members } = await db
    .from("members")
    .select("email, owner_ref, role, created_at, last_login_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (members ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];

  const ownerRefs = rows.map((row) => row.owner_ref as string);

  // Two batched lookups instead of two queries per member.
  const [{ data: balances }, { data: products }, { data: subs }] = await Promise.all([
    db.from("token_ledger").select("visitor_key, delta").in("visitor_key", ownerRefs),
    db.from("merchant_products").select("owner_ref, shop_slug").in("owner_ref", ownerRefs),
    db.from("store_subscriptions").select("owner_ref, status, trial_ends_at, paid_until").in("owner_ref", ownerRefs),
  ]);

  const tokenTotals = new Map<string, number>();
  for (const row of (balances ?? []) as Array<{ visitor_key: string; delta: number | string }>) {
    tokenTotals.set(row.visitor_key, (tokenTotals.get(row.visitor_key) ?? 0) + Number(row.delta));
  }

  const slugByOwner = new Map<string, string>();
  for (const row of (products ?? []) as Array<{ owner_ref: string; shop_slug: string }>) {
    if (!slugByOwner.has(row.owner_ref)) slugByOwner.set(row.owner_ref, row.shop_slug);
  }

  const subByOwner = new Map<string, { status: string; trial_ends_at: string | null; paid_until: string | null }>();
  for (const row of (subs ?? []) as Array<{
    owner_ref: string;
    status: string;
    trial_ends_at: string | null;
    paid_until: string | null;
  }>) {
    subByOwner.set(row.owner_ref, row);
  }

  const now = Date.now();
  return rows.map((row) => {
    const ownerRef = row.owner_ref as string;
    const sub = subByOwner.get(ownerRef);
    const trialEnds = sub?.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : null;
    const paidUntil = sub?.paid_until ? new Date(sub.paid_until).getTime() : null;
    const open =
      sub === undefined ||
      (sub.status === "trial" && trialEnds !== null && trialEnds > now) ||
      (sub.status === "active" && (paidUntil === null || paidUntil > now));

    return {
      email: row.email as string,
      ownerRef,
      role: row.role as string,
      createdAt: row.created_at as string,
      lastLoginAt: (row.last_login_at as string | null) ?? null,
      tokens: tokenTotals.get(ownerRef) ?? 0,
      storeSlug: slugByOwner.get(ownerRef) ?? null,
      storeStatus: sub?.status ?? null,
      storeOpen: open,
    };
  });
}

export async function loadPayoutQueue(): Promise<AdminPayout[]> {
  const db = getSupabase();
  if (!db) return [];

  const { data } = await db
    .from("payout_queue")
    .select("id, code, currency, amount_minor, status, requested_at, paid_at, note")
    .in("status", ["requested", "approved"])
    .limit(100);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id),
    code: row.code as string,
    currency: row.currency as string,
    amountMinor: Number(row.amount_minor),
    status: row.status as string,
    requestedAt: row.requested_at as string,
    paidAt: (row.paid_at as string | null) ?? null,
    note: (row.note as string | null) ?? null,
  }));
}

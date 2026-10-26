import { getSupabase } from "@/lib/db";

/**
 * Affiliate network reads for the dashboard.
 *
 * Identity is the same pseudonymous hash used everywhere else. A visitor with no
 * `referral_codes` row simply has no network yet; the dashboard shows how to
 * create one rather than an error.
 */

export type NetworkLevel = {
  level: number;
  people: number;
  /** Earnings this level produced, in minor units. */
  earnedMinor: number;
  /** Matrix percentage for this level, e.g. 50 for level 1. */
  percent: number;
};

export type AffiliateSummary = {
  code: string;
  levels: NetworkLevel[];
  /** Downline size excluding the visitor themselves. */
  totalPeople: number;
  /** Level 1 earnings, which are direct referrals rather than passive. */
  directMinor: number;
  /** Levels 2-19: the "passive income" the brief asks for. */
  passiveMinor: number;
  /** Available now (unpaid minus reserved payouts). */
  availableMinor: number;
  currency: string;
};

/** Matrix percentages, mirrored from `jutaone_level_bps` for display. */
function percentFor(level: number): number {
  if (level === 1) return 50;
  if (level === 2) return 4;
  if (level === 3) return 3;
  if (level === 4) return 2;
  if (level === 5) return 1;
  if (level <= 10) return 0.5;
  if (level <= 15) return 0.3;
  if (level <= 19) return 0.25;
  return 0;
}

/** Same shape as `referral_codes.code`; validated before it reaches a query. */
const CODE_RE = /^[a-z0-9][a-z0-9_-]{2,31}$/;

export function isValidReferralCode(value: string): boolean {
  return CODE_RE.test(value);
}

/**
 * Looks up a network by its referral code.
 *
 * Explicit lookup exists because the header-hash identity is fragile: a browser
 * changing its client hints changes the hash, and a merchant would silently lose
 * access to their own earnings. A code is stable, shareable and verifiable.
 *
 * Security note: a code is a bearer secret until Phase 2 adds real auth. It is
 * unguessable enough to demo, and it exposes only aggregate counts and earned
 * amounts — never customer data.
 */
export async function getAffiliateSummaryByCode(
  code: string,
): Promise<AffiliateSummary | null> {
  if (!isValidReferralCode(code)) return null;

  const db = getSupabase();
  if (!db) return null;

  const { data: codeRow, error } = await db
    .from("referral_codes")
    .select("id, code")
    .eq("code", code)
    .maybeSingle();

  if (error || !codeRow) {
    if (error) console.error("[jutaone] affiliate code lookup failed", error.message);
    return null;
  }
  return buildSummary(db, codeRow.id, codeRow.code);
}

export async function getAffiliateSummary(ownerRef: string): Promise<AffiliateSummary | null> {
  const db = getSupabase();
  if (!db) return null;

  const { data: codeRow, error } = await db
    .from("referral_codes")
    .select("id, code")
    .eq("owner_ref", ownerRef)
    .maybeSingle();

  if (error || !codeRow) {
    // A query failure and "no code yet" are different states; conflating them
    // made a broken dashboard look like an empty account during development.
    if (error) console.error("[jutaone] affiliate code lookup failed", error.message);
    return null;
  }

  return buildSummary(db, codeRow.id, codeRow.code);
}

async function buildSummary(
  db: NonNullable<ReturnType<typeof getSupabase>>,
  codeId: number,
  code: string,
): Promise<AffiliateSummary> {

  const [{ data: counts, error: countsError }, { data: balances }] = await Promise.all([
    db.rpc("jutaone_network_counts", { p_code_id: codeId }),
    db
      .from("affiliate_balances")
      .select("available_minor, currency")
      .eq("referral_code_id", codeId)
      .limit(1),
  ]);

  if (countsError) {
    console.error("[jutaone] network counts failed", countsError.message);
  }

  // `jutaone_network_counts` returns a stable 19 rows including zeros, so the
  // table never shifts shape as a network grows.
  const rows = (counts ?? []) as Array<{
    level: number;
    people: number;
    passive_earnings_minor: number | string;
  }>;

  const levels: NetworkLevel[] = rows.map((row) => ({
    level: Number(row.level),
    people: Number(row.people),
    earnedMinor: Number(row.passive_earnings_minor ?? 0),
    percent: percentFor(Number(row.level)),
  }));

  const directMinor = levels.find((level) => level.level === 1)?.earnedMinor ?? 0;
  const passiveMinor = levels
    .filter((level) => level.level >= 2)
    .reduce((sum, level) => sum + level.earnedMinor, 0);

  return {
    code,
    levels,
    totalPeople: levels.reduce((sum, level) => sum + level.people, 0),
    directMinor,
    passiveMinor,
    availableMinor: Number(balances?.[0]?.available_minor ?? 0),
    currency: (balances?.[0]?.currency as string | undefined) ?? "MYR",
  };
}

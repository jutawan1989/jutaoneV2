import { randomBytes } from "node:crypto";
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
  /** Earnings this tier produced, in minor units. */
  earnedMinor: number;
  /** Commission percentage for this tier, e.g. 50 for tier 1. */
  percent: number;
};

export type AffiliateSummary = {
  code: string;
  levels: NetworkLevel[];
  /** Referred-member count excluding the visitor themselves. */
  totalPeople: number;
  /** Tier 1 earnings, which are direct referrals rather than passive. */
  directMinor: number;
  /** Tiers 2-19: the network share of the commission. */
  passiveMinor: number;
  /** Available now (unpaid minus reserved payouts). */
  availableMinor: number;
  currency: string;
};

/**
 * Commission percentages, mirrored from `jutaone_level_bps` for display.
 *
 * Exported so the member dashboard can summarise the referral commission
 * without duplicating the schedule: two copies of a payout rate is exactly
 * how a member ends up seeing a number that disagrees with their own payout.
 */
export function percentFor(level: number): number {
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

/**
 * Looks up a referral code id by value. Used to attribute a new member to the
 * referrer who brought them in (`?ref=CODE` on the register page).
 */
export async function findReferralCodeId(code: string): Promise<number | null> {
  if (!isValidReferralCode(code)) return null;
  const db = getSupabase();
  if (!db) return null;

  const { data } = await db
    .from("referral_codes")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  return typeof data?.id === "number" ? data.id : null;
}

/**
 * Generates an 8-character referral code.
 *
 * Lowercase alphanumerics without lookalikes (no 0/1/i/l/o), so a code is
 * readable over WhatsApp and always satisfies the
 * `referral_codes_code_format` check (`^[a-z0-9][a-z0-9_-]{2,31}$`).
 */
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function generateReferralCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

/**
 * Ensures the member owns exactly one referral code, creating it on first use.
 *
 * Called on registration and when the Affiliate tab opens, so "Pautan Rujukan"
 * is never empty. Idempotent: an existing code is returned untouched (the
 * referrer link is never rewritten), and a code collision retries with a fresh
 * value. Returns null when the store is unavailable rather than throwing, so
 * callers can degrade to the empty state instead of breaking registration or
 * the dashboard.
 */
export async function ensureAffiliateCode(
  ownerRef: string,
  opts?: { parentCodeId?: number | null },
): Promise<string | null> {
  if (!ownerRef) return null;
  const db = getSupabase();
  if (!db) return null;

  const { data: rows } = await db
    .from("referral_codes")
    .select("id, code")
    .eq("owner_ref", ownerRef)
    .limit(1);
  const existing = (rows as Array<{ code?: unknown }> | null)?.[0]?.code;
  if (typeof existing === "string" && existing.length > 0) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const { error } = await db.from("referral_codes").insert({
      code,
      owner_ref: ownerRef,
      ...(opts?.parentCodeId ? { parent_code_id: opts.parentCodeId } : {}),
    });
    if (!error) return code;

    const collision = error.code === "23505" || /duplicate key|unique/i.test(error.message);
    if (!collision) {
      console.error("[jutaone] affiliate code insert failed", error.message);
      return null;
    }
    // A collision (or a concurrent insert for this owner): re-read before
    // minting another code so two tabs cannot mint two codes.
    const { data: raced } = await db
      .from("referral_codes")
      .select("code")
      .eq("owner_ref", ownerRef)
      .limit(1);
    const racedCode = (raced as Array<{ code?: unknown }> | null)?.[0]?.code;
    if (typeof racedCode === "string" && racedCode.length > 0) return racedCode;
  }

  console.error("[jutaone] affiliate code mint exhausted retries");
  return null;
}

import { getSupabase, supabaseConfigured } from "@/lib/db";

export type AttemptRow = {
  visitorKey: string;
  ipHash: string;
  deviceHash: string;
  locale: string;
  region: string;
};

export type CostRow = {
  /** UTC calendar day, `YYYY-MM-DD`. */
  day: string;
  costUsd: number;
  model: string;
  locale: string;
};

export interface UsageStore {
  /**
   * Accepted attempts for this visitor on a given local day.
   *
   * Day-scoped rather than lifetime: the quota resets at midnight, so a visitor
   * who came back a week later must not be locked out by history.
   */
  countByVisitor(visitorKey: string, day: string): Promise<number>;
  /** Same, for the device fingerprint, so rotating IP does not reset the quota. */
  countByDevice(deviceHash: string, day: string): Promise<number>;
  recordAttempt(row: AttemptRow): Promise<void>;
  /** USD spent on the AI provider for the given UTC day. */
  costForDay(day: string): Promise<number>;
  addCost(row: CostRow): Promise<void>;
}

type MemoryState = {
  attempts: Array<AttemptRow & { at: number }>;
  costs: Array<CostRow & { at: number }>;
};

const globalForStore = globalThis as unknown as { __joUsageStore?: MemoryState };

/** Local calendar day for an epoch millisecond value, `YYYY-MM-DD`. */
function dayOf(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function memoryState(): MemoryState {
  if (!globalForStore.__joUsageStore) {
    globalForStore.__joUsageStore = { attempts: [], costs: [] };
  }
  return globalForStore.__joUsageStore;
}

/**
 * In-memory fallback used when Supabase is not configured. It is enough for a
 * single long-lived server, but NOT for Cloudflare Pages: edge isolates are
 * recycled, so production enforcement requires Supabase.
 */
export const memoryStore: UsageStore = {
  async countByVisitor(visitorKey, day) {
    return memoryState().attempts.filter(
      (a) => a.visitorKey === visitorKey && dayOf(a.at) === day,
    ).length;
  },
  async countByDevice(deviceHash, day) {
    return memoryState().attempts.filter(
      (a) => a.deviceHash === deviceHash && dayOf(a.at) === day,
    ).length;
  },
  async recordAttempt(row) {
    memoryState().attempts.push({ ...row, at: Date.now() } as AttemptRow & { at: number });
  },
  async costForDay(day) {
    return memoryState()
      .costs.filter((c) => c.day === day)
      .reduce((sum, c) => sum + c.costUsd, 0);
  },
  async addCost(row) {
    memoryState().costs.push({ ...row, at: Date.now() });
  },
};

export const supabaseStore: UsageStore = {
  async countByVisitor(visitorKey, day) {
    const db = getSupabase();
    if (!db) return 0;
    // `created_at` is timestamptz; the window is the local day expressed in UTC
    // bounds so the quota resets at the visitor's midnight, not UTC midnight.
    const { startUtc, endUtc } = dayBoundsUtc(day);
    const { count } = await db
      .from("demo_attempts")
      .select("id", { count: "exact", head: true })
      .eq("visitor_key", visitorKey)
      .gte("created_at", startUtc)
      .lt("created_at", endUtc);
    return count ?? 0;
  },
  async countByDevice(deviceHash, day) {
    const db = getSupabase();
    if (!db) return 0;
    const { startUtc, endUtc } = dayBoundsUtc(day);
    const { count } = await db
      .from("demo_attempts")
      .select("id", { count: "exact", head: true })
      .eq("device_hash", deviceHash)
      .gte("created_at", startUtc)
      .lt("created_at", endUtc);
    return count ?? 0;
  },
  async recordAttempt(row) {
    const db = getSupabase();
    if (!db) return;
    const { error } = await db.from("demo_attempts").insert({
      visitor_key: row.visitorKey,
      ip_hash: row.ipHash,
      device_hash: row.deviceHash,
      locale: row.locale,
      region: row.region,
    });
    if (error) throw new Error(`demo_attempts insert failed: ${error.message}`);
  },
  async costForDay(day) {
    const db = getSupabase();
    if (!db) return 0;
    const { data, error } = await db.from("ai_usage").select("cost_usd").eq("day", day);
    if (error) throw new Error(`ai_usage select failed: ${error.message}`);
    return (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
  },
  async addCost(row) {
    const db = getSupabase();
    if (!db) return;
    const { error } = await db.from("ai_usage").insert({
      day: row.day,
      cost_usd: row.costUsd,
      model: row.model,
      locale: row.locale,
    });
    if (error) throw new Error(`ai_usage insert failed: ${error.message}`);
  },
};

/**
 * UTC bounds for a local calendar day.
 *
 * The quota must reset at the visitor's midnight, not UTC midnight: a merchant
 * in Jakarta or Kuala Lumpur would otherwise lose a fresh quota at 07:00 local.
 * The server runs with TZ unset, so the offset is derived from the runtime date.
 */
function dayBoundsUtc(day: string): { startUtc: string; endUtc: string } {
  const [y, m, d] = day.split("-").map(Number);
  const start = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const end = new Date(y, (m ?? 1) - 1, (d ?? 1) + 1, 0, 0, 0, 0);
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

export function getUsageStore(): UsageStore {
  return supabaseConfigured() ? supabaseStore : memoryStore;
}

/** Test helpers: reset the in-memory store between cases. */
export function resetMemoryStore(): void {
  globalForStore.__joUsageStore = { attempts: [], costs: [] };
}

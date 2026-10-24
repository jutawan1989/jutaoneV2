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
  /** Lifetime accepted attempts for this visitor key. */
  countByVisitor(visitorKey: string): Promise<number>;
  /** Lifetime accepted attempts for this device fingerprint (anti IP-rotation). */
  countByDevice(deviceHash: string): Promise<number>;
  recordAttempt(row: AttemptRow): Promise<void>;
  /** USD spent on the AI provider for the given UTC day. */
  costForDay(day: string): Promise<number>;
  addCost(row: CostRow): Promise<void>;
}

type MemoryState = {
  attempts: AttemptRow[];
  costs: Array<CostRow & { at: number }>;
};

const globalForStore = globalThis as unknown as { __joUsageStore?: MemoryState };

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
  async countByVisitor(visitorKey) {
    return memoryState().attempts.filter((a) => a.visitorKey === visitorKey).length;
  },
  async countByDevice(deviceHash) {
    return memoryState().attempts.filter((a) => a.deviceHash === deviceHash).length;
  },
  async recordAttempt(row) {
    memoryState().attempts.push(row);
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
  async countByVisitor(visitorKey) {
    const db = getSupabase();
    if (!db) return 0;
    const { count } = await db
      .from("demo_attempts")
      .select("id", { count: "exact", head: true })
      .eq("visitor_key", visitorKey);
    return count ?? 0;
  },
  async countByDevice(deviceHash) {
    const db = getSupabase();
    if (!db) return 0;
    const { count } = await db
      .from("demo_attempts")
      .select("id", { count: "exact", head: true })
      .eq("device_hash", deviceHash);
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

export function getUsageStore(): UsageStore {
  return supabaseConfigured() ? supabaseStore : memoryStore;
}

/** Test helpers: reset the in-memory store between cases. */
export function resetMemoryStore(): void {
  globalForStore.__joUsageStore = { attempts: [], costs: [] };
}

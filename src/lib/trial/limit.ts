import { getUsageStore, type UsageStore } from "./store";
import type { Visitor } from "./visitor";

/**
 * Daily demo quota.
 *
 * Boss and Linda replaced the 2-lifetime limit: a lifetime cap punishes someone
 * who came back a week later and never builds a habit. The quota is 5 per day,
 * reset at the visitor's local midnight, counted against both the visitor hash
 * and the device fingerprint so clearing cookies or rotating IP does not refill
 * it.
 *
 * `COPY_FREE_GENERATIONS` is the marketing hook: the first two generations of
 * the day are fully usable including copy; from the third the text is still
 * shown but copying is locked behind a top-up. The visitor keeps the value and
 * pays to use it commercially.
 */
export const DAILY_GENERATION_QUOTA = numericEnv("DEMO_DAILY_QUOTA", 5);
/** Generations per day whose output can be copied without paying. */
export const COPY_FREE_GENERATIONS = numericEnv("DEMO_COPY_FREE", 2);

export type DemoDecision = {
  allowed: boolean;
  used: number;
  max: number;
  remaining: number;
  /** Whether the Copy button is available for this generation. */
  copyAllowed: boolean;
  reason: "ok" | "daily_limit" | "device_limit" | "unavailable";
  /** Local day the quota applies to, `YYYY-MM-DD`. */
  day: string;
};

function numericEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

/** Local calendar day, used to scope and display the quota. */
export function localDay(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export async function evaluateDemoAccess(
  visitor: Visitor,
  store: UsageStore = getUsageStore(),
  now: Date = new Date(),
): Promise<DemoDecision> {
  const day = localDay(now);
  const max = DAILY_GENERATION_QUOTA;

  const [byVisitor, byDevice] = await Promise.all([
    store.countByVisitor(visitor.visitorKey, day),
    store.countByDevice(visitor.deviceHash, day),
  ]);

  const used = Math.max(byVisitor, byDevice, 0);
  // `used` is the count *before* this generation, so the generation being
  // requested is number `used + 1`. The first COPY_FREE_GENERATIONS are free.
  const copyAllowed = used < COPY_FREE_GENERATIONS;

  if (used >= max) {
    return {
      allowed: false,
      used,
      max,
      remaining: 0,
      copyAllowed: false,
      reason: "daily_limit",
      day,
    };
  }

  return {
    allowed: true,
    used,
    max,
    remaining: max - used,
    copyAllowed,
    reason: "ok",
    day,
  };
}

export async function recordDemoAttempt(
  visitor: Visitor,
  meta: { locale: string; region: string },
  store: UsageStore = getUsageStore(),
): Promise<void> {
  await store.recordAttempt({
    visitorKey: visitor.visitorKey,
    ipHash: visitor.ipHash,
    deviceHash: visitor.deviceHash,
    locale: meta.locale,
    region: meta.region,
  });
}

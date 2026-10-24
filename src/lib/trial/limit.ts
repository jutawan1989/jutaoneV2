import { getUsageStore, type UsageStore } from "./store";
import type { Visitor } from "./visitor";

export const DEMO_MAX_ATTEMPTS = numericEnv("DEMO_MAX_ATTEMPTS", 2);
/**
 * Secondary guard: the same device fingerprint cannot exceed this many attempts
 * across all IPs, which blocks the obvious "new IP, same browser" bypass.
 */
export const DEMO_DEVICE_MAX_ATTEMPTS = numericEnv("DEMO_DEVICE_MAX_ATTEMPTS", 4);

export type DemoDecision = {
  allowed: boolean;
  used: number;
  max: number;
  remaining: number;
  reason: "ok" | "visitor_limit" | "device_limit" | "unavailable";
};

function numericEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

export async function evaluateDemoAccess(
  visitor: Visitor,
  store: UsageStore = getUsageStore(),
): Promise<DemoDecision> {
  const [byVisitor, byDevice] = await Promise.all([
    store.countByVisitor(visitor.visitorKey),
    store.countByDevice(visitor.deviceHash),
  ]);

  const max = DEMO_MAX_ATTEMPTS;
  const used = Math.max(byVisitor, 0);

  if (byDevice >= DEMO_DEVICE_MAX_ATTEMPTS) {
    return { allowed: false, used, max, remaining: 0, reason: "device_limit" };
  }
  if (used >= max) {
    return { allowed: false, used, max, remaining: 0, reason: "visitor_limit" };
  }
  return { allowed: true, used, max, remaining: Math.max(max - used, 0), reason: "ok" };
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

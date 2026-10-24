import { getUsageStore, type UsageStore } from "@/lib/trial/store";

/** D3: demo disables automatically once the day's AI spend passes this. */
export const DAILY_API_COST_LIMIT_USD = numericEnv("DAILY_API_COST_LIMIT_USD", 50);

export type KillSwitchState = {
  disabled: boolean;
  reason: "manual" | "budget" | null;
  spentUsd: number;
  limitUsd: number;
};

function numericEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function getDailySpendUsd(
  day: string = utcDay(),
  store: UsageStore = getUsageStore(),
): Promise<number> {
  try {
    return await store.costForDay(day);
  } catch (error) {
    console.error("[jutaone] failed to read daily AI spend", error);
    return 0;
  }
}

/**
 * Kill switch: manual (`KILL_SWITCH_FORCE=1`) or automatic at the daily spend
 * ceiling. Fails open on storage errors so a database blip cannot take the
 * demo offline for everyone, except when a manual stop is set.
 */
export async function getKillSwitchState(
  store: UsageStore = getUsageStore(),
): Promise<KillSwitchState> {
  const limitUsd = DAILY_API_COST_LIMIT_USD;
  if (process.env.KILL_SWITCH_FORCE === "1") {
    return { disabled: true, reason: "manual", spentUsd: 0, limitUsd };
  }
  const spentUsd = await getDailySpendUsd(utcDay(), store);
  return {
    disabled: spentUsd >= limitUsd,
    reason: spentUsd >= limitUsd ? "budget" : null,
    spentUsd,
    limitUsd,
  };
}

export async function recordAiSpend(
  costUsd: number,
  meta: { model: string; locale: string },
  store: UsageStore = getUsageStore(),
): Promise<void> {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return;
  try {
    await store.addCost({ day: utcDay(), costUsd, model: meta.model, locale: meta.locale });
  } catch (error) {
    console.error("[jutaone] failed to record AI spend", error);
  }
}

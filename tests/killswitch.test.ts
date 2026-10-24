import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DAILY_API_COST_LIMIT_USD,
  getDailySpendUsd,
  getKillSwitchState,
  recordAiSpend,
  utcDay,
} from "@/lib/ai/budget";
import { memoryStore, resetMemoryStore } from "@/lib/trial/store";

describe("daily cost kill switch", () => {
  beforeEach(() => {
    resetMemoryStore();
    delete process.env.KILL_SWITCH_FORCE;
  });

  afterEach(() => {
    delete process.env.KILL_SWITCH_FORCE;
  });

  it("keeps the demo on below the ceiling", async () => {
    await recordAiSpend(10, { model: "test", locale: "en" }, memoryStore);
    await recordAiSpend(12.5, { model: "test", locale: "ms" }, memoryStore);

    const spent = await getDailySpendUsd(utcDay(), memoryStore);
    expect(spent).toBeCloseTo(22.5);

    const state = await getKillSwitchState(memoryStore);
    expect(state.disabled).toBe(false);
    expect(state.reason).toBeNull();
    expect(state.limitUsd).toBe(DAILY_API_COST_LIMIT_USD);
  });

  it("disables the demo once spend passes the ceiling", async () => {
    await recordAiSpend(DAILY_API_COST_LIMIT_USD + 0.01, { model: "test", locale: "en" }, memoryStore);

    const state = await getKillSwitchState(memoryStore);
    expect(state.disabled).toBe(true);
    expect(state.reason).toBe("budget");
    expect(state.spentUsd).toBeGreaterThan(DAILY_API_COST_LIMIT_USD);
  });

  it("honours the manual override", async () => {
    process.env.KILL_SWITCH_FORCE = "1";
    const state = await getKillSwitchState(memoryStore);
    expect(state.disabled).toBe(true);
    expect(state.reason).toBe("manual");
  });

  it("ignores non-positive or invalid cost entries", async () => {
    await recordAiSpend(0, { model: "mock", locale: "en" }, memoryStore);
    await recordAiSpend(Number.NaN, { model: "mock", locale: "en" }, memoryStore);
    expect(await getDailySpendUsd(utcDay(), memoryStore)).toBe(0);
  });

  it("uses the UTC calendar day", () => {
    expect(utcDay(new Date("2026-03-04T23:59:59Z"))).toBe("2026-03-04");
    expect(utcDay(new Date("2026-03-05T00:00:01Z"))).toBe("2026-03-05");
  });
});

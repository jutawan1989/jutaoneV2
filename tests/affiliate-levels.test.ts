import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_BONUS_PERCENT,
  COMMISSION_LEVELS,
  MAX_COMMISSION_PERCENT,
} from "@/lib/affiliate";

/**
 * CTO final: 3-Level affiliate (L1 50% / L2 10% / L3 5%) + 5% Bonus
 * Pencapaian. No 19-level / matrix schedule may be advertised.
 */
describe("3-level commission schedule", () => {
  it("advertises Level 1: 50%, Level 2: 10%, Level 3: 5%", () => {
    expect(COMMISSION_LEVELS).toHaveLength(3);
    expect(COMMISSION_LEVELS.map((tier) => [tier.level, tier.percent])).toEqual([
      [1, 50],
      [2, 10],
      [3, 5],
    ]);
  });

  it("adds a 5% achievement bonus for a 70% headline ceiling", () => {
    expect(ACHIEVEMENT_BONUS_PERCENT).toBe(5);
    const levelsTotal = COMMISSION_LEVELS.reduce((sum, tier) => sum + tier.percent, 0);
    expect(levelsTotal + ACHIEVEMENT_BONUS_PERCENT).toBe(MAX_COMMISSION_PERCENT);
    expect(MAX_COMMISSION_PERCENT).toBe(70);
  });
});

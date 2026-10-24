import { describe, expect, it } from "vitest";
import { assignVariant, resolveVariant } from "@/lib/analytics/variant";

describe("A/B hook variants (D4)", () => {
  it("is deterministic for the same visitor", () => {
    const first = assignVariant("visitor-hash-123");
    for (let index = 0; index < 25; index += 1) {
      expect(assignVariant("visitor-hash-123")).toBe(first);
    }
  });

  it("splits visitors roughly 50/50", () => {
    let a = 0;
    let b = 0;
    for (let index = 0; index < 2000; index += 1) {
      if (assignVariant(`visitor-${index}`) === "A") a += 1;
      else b += 1;
    }
    expect(a / (a + b)).toBeGreaterThan(0.45);
    expect(a / (a + b)).toBeLessThan(0.55);
  });

  it("allows a QA override outside production", () => {
    expect(resolveVariant("seed", "A")).toBe("A");
    expect(resolveVariant("seed", "B")).toBe("B");
    expect(resolveVariant("seed", "Z")).toBe(assignVariant("seed"));
  });
});

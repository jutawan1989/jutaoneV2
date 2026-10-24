import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "@/lib/i18n";
import { LOCALES } from "@/lib/i18n/config";
import {
  COMPLIANCE_DISCLAIMER_EN,
  COMPLIANCE_DISCLAIMER_ID,
  COMPLIANCE_DISCLAIMER_MS,
  findBannedPhrases,
} from "@/lib/compliance";

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    output.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((child) => collectStrings(child, output));
  }
  return output;
}

describe("copy compliance", () => {
  it.each(LOCALES)("%s copy never promises financial returns", (locale) => {
    const violations = collectStrings(DICTIONARIES[locale]).flatMap((text) => {
      const hits = findBannedPhrases(text);
      return hits.map((hit) => `${text} -> ${hit}`);
    });
    expect(violations).toEqual([]);
  });

  it("the detector catches the phrases we must avoid", () => {
    expect(findBannedPhrases("Guaranteed profit every month")).not.toEqual([]);
    expect(findBannedPhrases("Untung dijamin 30% sebulan")).not.toEqual([]);
    expect(findBannedPhrases("Dijamin cuan tanpa risiko")).not.toEqual([]);
    expect(findBannedPhrases("Kapsyen iklan dalam 3 saat")).toEqual([]);
  });

  it.each(LOCALES)("%s ships the approved simulation disclaimer", (locale) => {
    const expected = {
      en: COMPLIANCE_DISCLAIMER_EN,
      ms: COMPLIANCE_DISCLAIMER_MS,
      id: COMPLIANCE_DISCLAIMER_ID,
    }[locale];
    expect(DICTIONARIES[locale].gold.disclaimer).toBe(expected);
    expect(DICTIONARIES[locale].gold.note.length).toBeGreaterThan(20);
  });

  it("states that the widget is a simulation, not advice", () => {
    expect(DICTIONARIES.ms.gold.disclaimer).toBe(
      "Simulasi — bukan nasihat pelaburan/investasi",
    );
    expect(DICTIONARIES.id.gold.disclaimer).toContain("bukan nasihat investasi");
    expect(DICTIONARIES.en.gold.disclaimer).toContain("not investment advice");
  });

  it("every locale carries the no-guarantee statement", () => {
    for (const locale of LOCALES) {
      expect(DICTIONARIES[locale].compliance.noGuarantee.length).toBeGreaterThan(20);
    }
  });
});

import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "@/lib/i18n";
import { LOCALES, LOCALE_META, format, localeForRegion, localePath } from "@/lib/i18n/config";
import { COMPLIANCE_DISCLAIMER_MS } from "@/lib/compliance";

function flatten(value: unknown, prefix = ""): Record<string, string> {
  const output: Record<string, string> = {};
  if (typeof value === "string") {
    output[prefix] = value;
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      Object.assign(output, flatten(item, `${prefix}[${index}]`));
    });
    return output;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      Object.assign(output, flatten(child, prefix ? `${prefix}.${key}` : key));
    }
  }
  return output;
}

describe("dictionaries", () => {
  const englishKeys = Object.keys(flatten(DICTIONARIES.en)).sort();

  it.each(LOCALES)("%s has every key of the English dictionary", (locale) => {
    const keys = Object.keys(flatten(DICTIONARIES[locale])).sort();
    expect(keys).toEqual(englishKeys);
  });

  it.each(LOCALES)("%s has no empty strings", (locale) => {
    const flat = flatten(DICTIONARIES[locale]);
    const empty = Object.entries(flat)
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it("translates the demo label in all three languages", () => {
    expect(DICTIONARIES.ms.generator.label).toBe("Taip apa yang anda jual");
    expect(DICTIONARIES.id.generator.label).toBe("Ketik apa yang Anda jual");
    expect(DICTIONARIES.en.generator.label).toBe("Type what you sell");
  });

  it("uses the approved Malay disclaimer verbatim", () => {
    expect(DICTIONARIES.ms.gold.disclaimer).toBe(COMPLIANCE_DISCLAIMER_MS);
  });

  it("hreflang values match the requirement", () => {
    expect(LOCALE_META.ms.hreflang).toBe("ms-MY");
    expect(LOCALE_META.id.hreflang).toBe("id-ID");
    expect(LOCALE_META.en.hreflang).toBe("en");
  });
});

describe("locale helpers", () => {
  it("maps regions to locales (BM-first default)", () => {
    expect(localeForRegion("MY")).toBe("ms");
    expect(localeForRegion("ID")).toBe("id");
    expect(localeForRegion("OTHER")).toBe("ms");
  });

  it("builds locale paths", () => {
    expect(localePath("ms")).toBe("/ms");
    expect(localePath("id", "/topup")).toBe("/id/topup");
    expect(localePath("en", "/")).toBe("/en");
  });

  it("interpolates named placeholders only", () => {
    expect(format("Top up {price} for {tokenName}", { price: "$1", tokenName: "1 Juta Token" })).toBe(
      "Top up $1 for 1 Juta Token",
    );
    expect(format("{missing} stays", {})).toBe("{missing} stays");
  });

  it("keeps every locale's html lang tag", () => {
    expect(LOCALE_META.ms.htmlLang).toBe("ms-MY");
    expect(LOCALE_META.id.htmlLang).toBe("id-ID");
  });
});

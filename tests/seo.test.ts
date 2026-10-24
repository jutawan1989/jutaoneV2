import { afterEach, beforeEach, describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { LOCALES } from "@/lib/i18n/config";

describe("robots.txt", () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://jutaone.example";
  });

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = original;
  });

  it("allows crawling but hides the API", () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(["/api/"]);
  });

  it("advertises the sitemap on the configured origin", () => {
    expect(robots().sitemap).toBe("https://jutaone.example/sitemap.xml");
  });

  it("does not double up slashes when the env has a trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://jutaone.example/";
    expect(robots().sitemap).toBe("https://jutaone.example/sitemap.xml");
  });
});

describe("sitemap.xml", () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://jutaone.example";
  });

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = original;
  });

  it("lists one entry per locale", () => {
    const entries = sitemap();
    expect(entries).toHaveLength(LOCALES.length);
    expect(entries.map((entry) => entry.url)).toEqual(
      LOCALES.map((locale) => `https://jutaone.example/${locale}`),
    );
  });

  it("declares every locale as an alternate of each entry", () => {
    for (const entry of sitemap()) {
      const languages = entry.alternates?.languages ?? {};
      expect(languages["ms-MY"]).toBe("https://jutaone.example/ms");
      expect(languages["id-ID"]).toBe("https://jutaone.example/id");
      expect(languages.en).toBe("https://jutaone.example/en");
      expect(languages["x-default"]).toBe("https://jutaone.example/en");
    }
  });

  it("gives English the canonical priority", () => {
    const entries = sitemap();
    const english = entries.find((entry) => entry.url.endsWith("/en"));
    const malay = entries.find((entry) => entry.url.endsWith("/ms"));
    expect(english?.priority).toBe(1);
    expect(malay?.priority).toBeLessThan(1);
  });
});

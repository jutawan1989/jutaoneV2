import { describe, expect, it } from "vitest";
import { LOCALE_COOKIE, detectLocale, detectRegion, readCookie } from "@/lib/geo";

describe("geo routing (D6)", () => {
  it("routes Malaysian IPs to Malay", () => {
    const headers = new Headers({ "cf-ipcountry": "MY" });
    expect(detectRegion(headers)).toBe("MY");
    expect(detectLocale(headers)).toBe("ms");
  });

  it("routes Indonesian IPs to Indonesian", () => {
    const headers = new Headers({ "cf-ipcountry": "ID" });
    expect(detectRegion(headers)).toBe("ID");
    expect(detectLocale(headers)).toBe("id");
  });

  it("routes other countries to English", () => {
    for (const country of ["SG", "US", "GB", "AU"]) {
      expect(detectRegion(new Headers({ "cf-ipcountry": country }))).toBe("OTHER");
      expect(detectLocale(new Headers({ "cf-ipcountry": country }))).toBe("en");
    }
  });

  it("prefers an explicit language choice from the cookie", () => {
    const headers = new Headers({
      "cf-ipcountry": "MY",
      cookie: `${LOCALE_COOKIE}=id`,
    });
    expect(detectLocale(headers)).toBe("id");
  });

  it("falls back to accept-language when Cloudflare headers are absent", () => {
    expect(detectRegion(new Headers({ "accept-language": "ms-MY,ms;q=0.9,en;q=0.8" }))).toBe("MY");
    expect(detectRegion(new Headers({ "accept-language": "id-ID,id;q=0.9" }))).toBe("ID");
    expect(detectRegion(new Headers({ "accept-language": "fr-FR,fr;q=0.9" }))).toBe("OTHER");
  });

  it("treats the Cloudflare unknown/error country codes as unknown", () => {
    expect(detectRegion(new Headers({ "cf-ipcountry": "XX" }))).toBe("OTHER");
    expect(detectRegion(new Headers({ "cf-ipcountry": "T1" }))).toBe("OTHER");
  });

  it("respects FORCE_REGION for QA", () => {
    process.env.FORCE_REGION = "ID";
    expect(detectRegion(new Headers({ "cf-ipcountry": "MY" }))).toBe("ID");
    delete process.env.FORCE_REGION;
  });

  it("parses cookies safely", () => {
    expect(readCookie("a=1; jo_locale=ms; b=2", "jo_locale")).toBe("ms");
    expect(readCookie("a=1", "jo_locale")).toBeNull();
    expect(readCookie(null, "jo_locale")).toBeNull();
  });
});

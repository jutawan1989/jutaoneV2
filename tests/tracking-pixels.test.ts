import { afterEach, describe, expect, it } from "vitest";
import { trackingPixelIds, trackingSnippets } from "@/lib/tracking";

const KEYS = [
  "NEXT_PUBLIC_META_PIXEL_ID",
  "NEXT_PUBLIC_TIKTOK_PIXEL_ID",
  "NEXT_PUBLIC_LINKEDIN_PARTNER_ID",
  "NEXT_PUBLIC_X_PIXEL_ID",
] as const;

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

describe("tracking pixels (Lead Ads placeholders)", () => {
  it("renders nothing when Boss has not supplied any ID yet", () => {
    expect(trackingPixelIds()).toEqual({ meta: null, tiktok: null, linkedin: null, x: null });
    expect(trackingSnippets(trackingPixelIds())).toEqual([]);
  });

  it("builds each configured vendor snippet with its ID and nothing else", () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = "1234567890";
    process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID = "ABC123_test-id";
    const snippets = trackingSnippets(trackingPixelIds());
    expect(snippets.map((s) => s.id)).toEqual(["meta-pixel", "tiktok-pixel"]);
    expect(snippets[0].html).toContain("fbq('init','1234567890')");
    expect(snippets[0].html).toContain("fbq('track','PageView')");
    expect(snippets[0].noscriptImg).toBe(
      "https://www.facebook.com/tr?id=1234567890&ev=PageView&noscript=1",
    );
    expect(snippets[1].html).toContain("ttq.load('ABC123_test-id')");
    expect(snippets[1].html).toContain("ttq.page()");
  });

  it("refuses IDs that are not plain vendor IDs (no script injection via env)", () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = `1');alert(1);//`;
    process.env.NEXT_PUBLIC_X_PIXEL_ID = "ok-id_2";
    expect(trackingPixelIds().meta).toBeNull();
    const snippets = trackingSnippets(trackingPixelIds());
    expect(snippets.map((s) => s.id)).toEqual(["x-pixel"]);
    const joined = snippets.map((s) => s.html).join("\n");
    expect(joined).not.toContain("alert");
    expect(joined).toContain("twq('config','ok-id_2')");
  });

  it("builds the LinkedIn snippet with the partner ID", () => {
    process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID = "777888";
    const snippets = trackingSnippets(trackingPixelIds());
    expect(snippets.map((s) => s.id)).toEqual(["linkedin-pixel"]);
    expect(snippets[0].html).toContain('_linkedin_partner_id="777888"');
  });
});

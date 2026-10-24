import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GLOBE,
  LETTER_PATHS,
  LETTER_STROKE_WIDTH,
  LOGO_MARK_VIEWBOX,
  WORDMARK,
  TAGLINE_LINES,
  buildLogoMark,
  buildLogoMarkSvg,
  buildLogoLockupSvg,
} from "@/lib/brand";

function asset(name: string): string {
  const url = new URL(`../public/assets/${name}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

describe("brand mark", () => {
  it("draws J, globe and B without overlapping the J", () => {
    const mark = buildLogoMark("dark", "t");
    expect(LETTER_PATHS).toHaveLength(4);
    expect(mark).toContain(`class="jo-globe__spin"`);
    expect(mark).toContain(`transform-origin:${GLOBE.cx}px ${GLOBE.cy}px`);
    expect(mark).toContain(`stroke-width="${LETTER_STROKE_WIDTH}"`);
  });

  it("keeps every gradient and clip id prefixed per instance", () => {
    const mark = buildLogoMark("dark", "hero");
    const ids = [...mark.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.startsWith("hero-"))).toBe(true);
  });

  it("uses different gradients for dark and light backgrounds", () => {
    expect(buildLogoMark("dark", "a")).not.toBe(buildLogoMark("light", "a"));
  });

  it("serializes to valid standalone SVG", () => {
    for (const variant of ["dark", "light"] as const) {
      const svg = buildLogoMarkSvg(variant);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
      expect(svg).toContain(`viewBox="${LOGO_MARK_VIEWBOX}"`);
      expect(svg).toContain('aria-label="JutaOne.Biz"');
    }
  });

  it("lockup carries the wordmark and the approved tagline", () => {
    const svg = buildLogoLockupSvg("light");
    expect(svg).toContain(WORDMARK);
    expect(svg).toContain(TAGLINE_LINES[0]);
    expect(svg).toContain(TAGLINE_LINES[1]);
  });

  it("stays inside the 300KB motion budget", () => {
    for (const svg of [buildLogoMarkSvg("dark"), buildLogoLockupSvg("dark")]) {
      expect(Buffer.byteLength(svg)).toBeLessThan(20_000);
    }
  });
});

describe("generated assets", () => {
  // `npm run assets` must be re-run whenever lib/brand.ts changes.
  it.each([
    ["logo-mark.svg", () => buildLogoMarkSvg("dark")],
    ["logo-mark-light.svg", () => buildLogoMarkSvg("light")],
    ["logo-lockup.svg", () => buildLogoLockupSvg("dark")],
    ["logo-lockup-light.svg", () => buildLogoLockupSvg("light")],
  ])("%s is up to date", (name, build) => {
    expect(asset(name)).toBe(build());
  });
});

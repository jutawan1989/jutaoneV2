/**
 * Brand source of truth for the JutaOne.Biz logo.
 *
 * The mark is "JOB" where the O is a globe. Geometry lives here only: the React
 * component and the generated files in `public/assets/` are both built from
 * these constants, so they cannot drift apart.
 *
 * Variants exist because the mark needs different contrast per background:
 * `dark` brightens the gradient for the dark UI, `light` uses the deeper
 * corporate blue from the official lockup (white background).
 */

export type LogoVariant = "dark" | "light";

export const BRAND_COLORS = {
  /** Corporate blue stops: legible on the dark UI without reading as neon. */
  darkTop: "#93C5FD",
  darkMid: "#3B82F6",
  darkDeep: "#1D4ED8",
  /** Deep stops: the corporate gradient on light backgrounds. */
  lightTop: "#3B82F6",
  lightMid: "#1D4ED8",
  lightDeep: "#0F2E6B",
  globeRim: "#60A5FA",
  globeCore: "#0B2A5B",
  globeMid: "#1E40AF",
  land: "#2F7A5B",
  landLight: "#4A9E77",
  net: "#93C5FD",
  wordmark: "#12345F",
  tagline: "#1F3D63",
} as const;

export const LOGO_MARK_VIEWBOX = "0 0 128 62";
export const LOGO_LOCKUP_VIEWBOX = "0 0 160 112";

/** Letters J and B. The O is the globe. Drawn as stroked paths. */
export const LETTER_STROKE_WIDTH = 11;
export const LETTER_PATHS: readonly string[] = [
  // J: top arm, stem, then a quarter-round hook to the left.
  "M 12 13 H 28 V 38 A 10 10 0 0 1 8 38",
  // B: stem plus two bowls. Starts after the globe with the same gap as the J.
  "M 104 13 V 48",
  "M 104 13 A 12 8.5 0 0 1 104 30",
  "M 104 30 A 13 9 0 0 1 104 48",
];

export const GLOBE = { cx: 66, cy: 31, r: 27 } as const;

/** Abstract landmasses, clipped to the sphere. */
export const CONTINENTS: readonly string[] = [
  // Asia
  "M 52 18 C 58 11 70 9 78 15 C 84 19 84 26 76 28 C 70 30 64 27 60 31 C 55 36 48 33 47 27 C 46 22 48 19 52 18 Z",
  // Australia
  "M 74 44 C 80 42 86 45 85 50 C 84 54 77 55 73 51 C 71 48 72 45 74 44 Z",
];

/** Small islands (Indonesia / Philippines feel). */
export const ISLANDS: readonly { cx: number; cy: number; r: number }[] = [
  { cx: 70, cy: 40, r: 2.6 },
  { cx: 76, cy: 43, r: 2.1 },
  { cx: 81, cy: 44, r: 1.7 },
  { cx: 62, cy: 38, r: 1.5 },
];

export const MERIDIANS: readonly number[] = [6, 12, 18, 24];
export const PARALLELS: readonly number[] = [7, 14, 21];

/** Faint connection arcs, echoing the "AI network" motif of the brand. */
export const NETWORK_ARCS: readonly string[] = [
  "M 50 22 Q 66 8 84 22",
  "M 47 32 Q 66 44 86 32",
];

export const NODES: readonly { cx: number; cy: number; r: number }[] = [
  { cx: 50, cy: 22, r: 1.5 },
  { cx: 84, cy: 22, r: 1.5 },
  { cx: 66, cy: 12, r: 1.3 },
  { cx: 70, cy: 40, r: 1.4 },
];

export const WORDMARK = "JUTAONE.BIZ";
export const TAGLINE_LINES: readonly [string, string] = [
  "DON'T JUST WATCH THE FUTURE—EXPLORE IT,",
  "SEIZE THE OPPORTUNITY, AND NEVER LET IT GO.",
];

function lettersGradient(variant: LogoVariant): [string, string, string] {
  return variant === "dark"
    ? [BRAND_COLORS.darkTop, BRAND_COLORS.darkMid, BRAND_COLORS.darkDeep]
    : [BRAND_COLORS.lightTop, BRAND_COLORS.lightMid, BRAND_COLORS.lightDeep];
}

/**
 * Serializes the mark. `idPrefix` keeps gradient/clip ids unique when several
 * copies end up in one document (the React component renders inline).
 */
export function buildLogoMark(variant: LogoVariant, idPrefix = "jo-logo"): string {
  const [top, mid, deep] = lettersGradient(variant);
  const { cx, cy, r } = GLOBE;

  const meridians = MERIDIANS.map(
    (rx) =>
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${r}" fill="none" stroke="${BRAND_COLORS.globeRim}" stroke-width="0.6" stroke-opacity="0.28"/>`,
  ).join("");

  const parallels = PARALLELS.map(
    (ry) =>
      `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${ry}" fill="none" stroke="${BRAND_COLORS.globeRim}" stroke-width="0.6" stroke-opacity="0.24"/>`,
  ).join("");

  const letters = LETTER_PATHS.map(
    (d) =>
      `<path d="${d}" fill="none" stroke="url(#${idPrefix}-letters)" stroke-width="${LETTER_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`,
  ).join("");

  const continents = CONTINENTS.map((d) => `<path d="${d}" fill="${BRAND_COLORS.land}"/>`).join("");

  const islands = ISLANDS.map(
    (island) =>
      `<circle cx="${island.cx}" cy="${island.cy}" r="${island.r}" fill="${BRAND_COLORS.landLight}"/>`,
  ).join("");

  const arcs = NETWORK_ARCS.map(
    (d) =>
      `<path d="${d}" fill="none" stroke="${BRAND_COLORS.net}" stroke-width="0.7" stroke-opacity="0.55"/>`,
  ).join("");

  const nodes = NODES.map(
    (node) =>
      `<circle cx="${node.cx}" cy="${node.cy}" r="${node.r}" fill="${BRAND_COLORS.net}" fill-opacity="0.95"/>`,
  ).join("");

  return [
    `<defs>`,
    `<linearGradient id="${idPrefix}-letters" x1="0" y1="7" x2="0" y2="54" gradientUnits="userSpaceOnUse">`,
    `<stop offset="0" stop-color="${top}"/>`,
    `<stop offset="0.55" stop-color="${mid}"/>`,
    `<stop offset="1" stop-color="${deep}"/>`,
    `</linearGradient>`,
    `<radialGradient id="${idPrefix}-sphere" cx="38%" cy="28%" r="76%">`,
    `<stop offset="0" stop-color="${BRAND_COLORS.globeMid}"/>`,
    `<stop offset="0.62" stop-color="${BRAND_COLORS.globeCore}"/>`,
    `<stop offset="1" stop-color="#061A3A"/>`,
    `</radialGradient>`,
    `<radialGradient id="${idPrefix}-halo" cx="50%" cy="50%" r="50%">`,
    `<stop offset="0.72" stop-color="${BRAND_COLORS.globeRim}" stop-opacity="0.28"/>`,
    `<stop offset="1" stop-color="${BRAND_COLORS.globeRim}" stop-opacity="0"/>`,
    `</radialGradient>`,
    `<clipPath id="${idPrefix}-clip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`,
    `</defs>`,
    `<circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="url(#${idPrefix}-halo)"/>`,
    letters,
    `<g class="jo-globe">`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${idPrefix}-sphere)"/>`,
    `<g clip-path="url(#${idPrefix}-clip)">`,
    `<g class="jo-globe__spin" style="transform-origin:${cx}px ${cy}px">`,
    continents,
    islands,
    meridians,
    parallels,
    arcs,
    nodes,
    `</g>`,
    `</g>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${BRAND_COLORS.globeRim}" stroke-width="1.6" stroke-opacity="0.85"/>`,
    `</g>`,
  ].join("");
}

export function buildLogoMarkSvg(variant: LogoVariant): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_MARK_VIEWBOX}" width="480" height="248" role="img" aria-label="JutaOne.Biz">${buildLogoMark(
    variant,
    "jo-mark",
  )}</svg>\n`;
}

/** Mark + wordmark + tagline, as in the official lockup. */
export function buildLogoLockupSvg(variant: LogoVariant): string {
  const wordmarkColor = variant === "dark" ? "#FFFFFF" : BRAND_COLORS.wordmark;
  const taglineColor = variant === "dark" ? "#C7D6EA" : BRAND_COLORS.tagline;
  const font = "Inter, 'Segoe UI', Arial, Helvetica, sans-serif";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_LOCKUP_VIEWBOX}" width="640" height="448" role="img" aria-label="JutaOne.Biz">`,
    `<g transform="translate(16 0)">${buildLogoMark(variant, "jo-lockup")}</g>`,
    `<text x="80" y="84" text-anchor="middle" font-family="${font}" font-size="15" font-weight="800" letter-spacing="0.6" fill="${wordmarkColor}">${WORDMARK}</text>`,
    `<text x="80" y="97" text-anchor="middle" font-family="${font}" font-size="4.4" font-weight="600" letter-spacing="0.2" fill="${taglineColor}">${TAGLINE_LINES[0]}</text>`,
    `<text x="80" y="104" text-anchor="middle" font-family="${font}" font-size="4.4" font-weight="600" letter-spacing="0.2" fill="${taglineColor}">${TAGLINE_LINES[1]}</text>`,
    `</svg>\n`,
  ].join("");
}

import { trackingPixelIds, trackingPixelsHtml } from "@/lib/tracking";

/**
 * Ad-pixel placeholders (Lead Ads foundation — Xiana's blueprint).
 *
 * One component, four vendors: Meta, TikTok, LinkedIn, X. All markup comes
 * from `lib/tracking.ts` as a single HTML string (unit-tested) — this file
 * is intentionally a one-element wrapper so no JSX construct can ever break
 * a test runner or bundler again.
 *
 * Mounted once in the root layout, so every page — including the waitlist —
 * is attribution-ready from day one.
 */
export { trackingPixelIds };

export function TrackingPixels() {
  const html = trackingPixelsHtml(trackingPixelIds());
  if (!html) return null;
  return <div id="tracking-pixels" dangerouslySetInnerHTML={{ __html: html }} />;
}

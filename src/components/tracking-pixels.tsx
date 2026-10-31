import { trackingPixelIds, trackingSnippets } from "@/lib/tracking";

/**
 * Ad-pixel placeholders (Lead Ads foundation — Xiana's blueprint).
 *
 * One component, four vendors: Meta, TikTok, LinkedIn, X. Snippet bodies
 * come from `lib/tracking.ts` (unit-tested); this file is only JSX.
 * Mounted once in the root layout, so every page — including the waitlist —
 * is attribution-ready from day one.
 */
export { trackingPixelIds };

export function TrackingPixels() {
  const snippets = trackingSnippets(trackingPixelIds());
  if (snippets.length === 0) return null;
  return (
    <>
      {snippets.map((snippet) => (
        <span key={snippet.id} style={{ display: "contents" }}>
          <script id={snippet.id} dangerouslySetInnerHTML={{ __html: snippet.html }} />
          {snippet.noscriptImg && (
            <noscript>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img height="1" width="1" style={{ display: "none" }} alt="" src={snippet.noscriptImg} />
            </noscript>
          )}
        </span>
      ))}
    </>
  );
}

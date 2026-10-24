import type { Dictionary } from "@/lib/i18n";

/**
 * The "moving billboard": a pure-CSS marquee of sample captions. The track is
 * duplicated so the loop is seamless, and it pauses on hover/focus. Animation
 * is disabled under `prefers-reduced-motion`.
 */
export function Billboard({ dict }: { dict: Dictionary }) {
  const cards = dict.billboard.cards;
  const doubled = [...cards, ...cards];

  return (
    <section aria-label={dict.billboard.label} className="relative border-y border-line/60 bg-white/[0.015] py-4">
      <div className="marquee">
        <div className="marquee__track">
          {doubled.map((text, index) => (
            <span
              key={`${text}-${index}`}
              aria-hidden={index >= cards.length ? true : undefined}
              className="flex shrink-0 items-center gap-2 rounded-full border border-line/80 bg-surface/70 px-4 py-2 text-sm text-silver/90"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              {text}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

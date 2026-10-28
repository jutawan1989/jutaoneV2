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
    <section
      aria-label={dict.billboard.label}
      className="relative border-y border-slate-200 bg-white py-3.5"
    >
      <p className="mx-auto mb-2.5 w-full max-w-6xl px-4 text-center text-[11px] font-medium tracking-[0.12em] text-slate-500 uppercase sm:px-6">
        {dict.industries.label}:{" "}
        <span className="text-slate-700 normal-case tracking-normal">
          {dict.industries.items.join("  |  ")}
        </span>
      </p>
      <div className="marquee">
        <div className="marquee__track">
          {doubled.map((text, index) => (
            <span
              key={`${text}-${index}`}
              aria-hidden={index >= cards.length ? true : undefined}
              className="flex shrink-0 items-center gap-2.5 border-r border-slate-200 pr-4 text-[13px] text-slate-500 last:border-r-0"
            >
              <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-brand/70" />
              {text}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

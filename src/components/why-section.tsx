import { PremiumArt } from "@/components/premium-art";
import type { Dictionary } from "@/lib/i18n";

/**
 * "Mengapa JutaOne.Biz?" — Dual-Tone light section.
 *
 * Two parts, both mobile-first:
 *  1. Ecosystem flow: four premium assets (robot → token → Biz-Match →
 *     gold) showing one business flow in a 2x2 grid on phones.
 *  2. Honest comparison: "AI Biasa" (grey, ✕) vs "JutaOne.Biz"
 *     (brand-highlighted, ✓). No trademarked names anywhere.
 */
const ECO_ART = [
  { src: "/assets/ai-robot.jpg", glow: "cyan" as const },
  { src: "/assets/token.jpg", glow: "cyan" as const },
  { src: "/assets/biz-match.jpg", glow: "cyan" as const },
  { src: "/assets/gold.jpg", glow: "gold" as const },
];

export function WhySection({ dict }: { dict: Dictionary }) {
  return (
    <section id="mengapa" className="scroll-mt-24 border-t border-slate-200 bg-slate-50 py-12 sm:py-20">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-6">
        <p className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium tracking-[0.12em] text-slate-500 uppercase">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
          {dict.why.eyebrow}
        </p>
        <h2 className="mt-5 max-w-2xl text-2xl font-semibold tracking-[-0.02em] text-balance text-slate-900 sm:text-3xl">
          {dict.why.title}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600">{dict.why.subtitle}</p>

        {/* Ecosystem flow: one flow, four systems. */}
        <p className="mt-8 text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase">
          {dict.why.ecoTitle}
        </p>
        <ol className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {dict.why.ecoSteps.map((step, index) => {
            const art = ECO_ART[index] ?? ECO_ART[0];
            return (
              <li
                key={step}
                className="flex min-w-0 flex-col rounded-2xl bg-gradient-to-b from-[#0a1f4d] to-[#0a1730] p-3 ring-1 ring-slate-900/10"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-xl">
                  <span
                    aria-hidden
                    className="absolute top-2 right-2.5 z-10 text-[11px] font-bold text-white/40 tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <PremiumArt
                    src={art.src}
                    alt={step}
                    size={320}
                    glow={art.glow}
                    rounded="rounded-xl"
                    className="h-full w-full"
                  />
                </div>
                <p className="mt-2.5 flex min-h-8 items-start justify-center text-center text-xs leading-snug font-semibold break-words text-white">
                  {step}
                </p>
              </li>
            );
          })}
        </ol>

        {/* Honest comparison. */}
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
              {dict.why.genericName}
            </p>
            <ul className="mt-4 space-y-3">
              {dict.why.genericItems.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-slate-500">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-400 ring-1 ring-slate-200 ring-inset"
                  >
                    ✕
                  </span>
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative overflow-hidden rounded-2xl border-2 border-brand/50 bg-white p-5 shadow-[0_24px_60px_-24px_rgba(37,99,235,0.45)] sm:p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(20rem_6rem_at_50%_0%,rgba(59,130,246,0.12),transparent_70%)]"
            />
            <div className="relative flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-brand uppercase">
                {dict.why.brandName}
              </p>
              <span className="rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] text-white uppercase">
                {dict.why.brandBadge}
              </span>
            </div>
            <ul className="relative mt-4 space-y-3">
              {dict.why.brandItems.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm font-medium text-slate-800">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-600 ring-1 ring-emerald-500/30 ring-inset"
                  >
                    ✓
                  </span>
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

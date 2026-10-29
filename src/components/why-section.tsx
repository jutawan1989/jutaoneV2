import { Coins, Megaphone, Network, Store } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";

/**
 * "Mengapa JutaOne.Biz?" — Dark Slate Blue section (matches Hero).
 *
 * Two parts, both mobile-first:
 *  1. Ecosystem flow: four systems as neon/minimalist SVG vector icons
 *     (lucide-react with cyan glow) in a 2x2 grid on phones.
 *  2. Honest comparison: "AI Biasa" (muted, ✕) vs "JutaOne.Biz"
 *     (brand-highlighted, ✓). No trademarked names anywhere.
 */
const ECO_ICONS = [
  { Icon: Megaphone, glow: "text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" },
  { Icon: Store, glow: "text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]" },
  { Icon: Network, glow: "text-sky-400 drop-shadow-[0_0_10px_rgba(56,189,248,0.5)]" },
  { Icon: Coins, glow: "text-amber-300 drop-shadow-[0_0_10px_rgba(252,211,77,0.5)]" },
] as const;

export function WhySection({ dict }: { dict: Dictionary }) {
  return (
    <section id="mengapa" className="scroll-mt-24 border-t border-white/[0.06] bg-[#0A0F1D] py-12 sm:py-20">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-6">
        <p className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
          {dict.why.eyebrow}
        </p>
        <h2 className="mt-5 max-w-2xl text-2xl font-semibold tracking-[-0.02em] text-balance text-white sm:text-3xl">
          {dict.why.title}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{dict.why.subtitle}</p>

        {/* Ecosystem flow: one flow, four systems. */}
        <p className="mt-8 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
          {dict.why.ecoTitle}
        </p>
        <ol className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {dict.why.ecoSteps.map((step, index) => {
            const { Icon, glow } = ECO_ICONS[index] ?? ECO_ICONS[0];
            return (
              <li
                key={step}
                className="flex min-w-0 flex-col items-center rounded-2xl border border-white/[0.07] bg-[#0B1220] p-5 text-center ring-1 ring-white/[0.04] ring-inset"
              >
                <span
                  aria-hidden
                  className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03] ring-1 ring-white/10 ring-inset"
                >
                  <Icon className={`size-8 ${glow}`} aria-hidden />
                </span>
                <span
                  aria-hidden
                  className="mt-3 text-[11px] font-bold text-white/40 tabular-nums"
                >
                  0{index + 1}
                </span>
                <p className="mt-1.5 flex min-h-8 items-start justify-center text-center text-xs leading-snug font-semibold break-words text-white">
                  {step}
                </p>
              </li>
            );
          })}
        </ol>

        {/* Honest comparison. */}
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.07] bg-[#0B1220] p-5 sm:p-6">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
              {dict.why.genericName}
            </p>
            <ul className="mt-4 space-y-3">
              {dict.why.genericItems.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-muted">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-[11px] font-bold text-muted ring-1 ring-white/10 ring-inset"
                  >
                    ✕
                  </span>
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative overflow-hidden rounded-2xl border-2 border-brand/50 bg-[#0B1220] p-5 shadow-[0_24px_60px_-24px_rgba(37,99,235,0.45)] sm:p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(20rem_6rem_at_50%_0%,rgba(59,130,246,0.16),transparent_70%)]"
            />
            <div className="relative flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-soft uppercase">
                {dict.why.brandName}
              </p>
              <span className="rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] text-white uppercase">
                {dict.why.brandBadge}
              </span>
            </div>
            <ul className="relative mt-4 space-y-3">
              {dict.why.brandItems.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm font-medium text-silver">
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

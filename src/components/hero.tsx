import Link from "next/link";
import { PremiumArt } from "@/components/premium-art";
import { HeroTryBox, LiveTelemetryCounter } from "@/components/conversion";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import type { Price } from "@/lib/pricing";

/**
 * Hero. The brand mark is the centrepiece: the globe that forms the O of JOB
 * spins via a single CSS transform (no video, no canvas), and stops under
 * `prefers-reduced-motion`.
 *
 * Marketing-driven (CTO spec): pain-led headline, glowing blue demo CTA,
 * dual trust signals, mobile-first bank-like breathing room.
 */
export function Hero({
  dict,
  price,
  locale,
}: {
  dict: Dictionary;
  price: Price;
  locale: Locale;
}) {
  return (
    <section className="relative bg-gradient-to-b from-[#0a1f4d] via-[#0b2557] to-[#0a1730] text-white">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 pt-12 pb-10 sm:gap-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-24 lg:pb-14">
        <div className="min-w-0">
          <LiveTelemetryCounter locale={locale} />
          <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium tracking-[0.12em] text-white/90 uppercase">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <span className="truncate">{dict.hero.eyebrow}</span>
          </p>

          <h1 className="mt-5 text-[2rem] leading-[1.12] font-semibold tracking-[-0.025em] text-balance text-white sm:text-5xl sm:leading-[1.08]">
            {dict.hero.title} <span className="text-brand-soft sm:text-brand">{dict.hero.titleAccent}</span>
          </h1>

          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/75 sm:text-base">
            {dict.hero.subtitle}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="#demo"
              className="btn-brand btn-glow cta-glow hero-cta min-h-[52px] w-full px-6 text-base font-bold sm:w-auto"
            >
              {dict.hero.ctaPrimary}
              <span aria-hidden className="text-lg leading-none">→</span>
            </Link>
            <Link href="#pricing" className="flex min-h-[52px] w-full items-center justify-center px-6 py-3 text-center text-[15px] font-medium text-white/80 transition-colors hover:text-white sm:inline-flex sm:w-auto sm:py-0">
              {dict.hero.ctaSecondary}
            </Link>
          </div>

          <HeroTryBox locale={locale} />

          {/* Trust signals: social proof + safety — bank-grade reassurance row. */}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-white">
              <span aria-hidden>⭐</span>
              <span>{dict.hero.trustSocial}</span>
            </p>
            <p className="flex items-center gap-2 text-[13px] font-medium text-white/70">
              <span aria-hidden>🔒</span>
              <span>{dict.hero.trustSecure}</span>
            </p>
          </div>

          <dl className="mt-8 grid grid-cols-3 gap-2 border-t border-white/10 pt-6 sm:mt-11 sm:gap-6">
            {dict.hero.stats.map((stat) => (
              <div key={stat.label} className="min-w-0 rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06] ring-inset sm:bg-transparent sm:p-0 sm:ring-0">
                <dt className="text-base font-semibold text-white tabular-nums sm:text-xl">
                  {stat.value}
                </dt>
                <dd className="mt-1.5 text-[11px] leading-snug text-white/65 sm:text-xs">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative min-w-0">
          <div className="card relative overflow-hidden rounded-2xl p-5 sm:p-7">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(22rem_14rem_at_50%_-10%,rgba(37,99,235,0.22),transparent_72%)]"
            />

            <div className="relative flex flex-col items-center gap-5">
              <PremiumArt
                src="/assets/logo2.jpg"
                alt={dict.a11y.globeLabel}
                size={232}
                glow="cyan"
                className="h-auto w-full max-w-[232px]"
              />

              <p className="max-w-[18rem] text-center text-[11px] leading-relaxed text-white/60">
                {dict.footer.tagline}
              </p>

              <div className="mt-2 flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-ink/50 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-[11px] tracking-[0.1em] text-white/60 uppercase">
                    {dict.pricing.tokenName}
                  </p>
                  <p className="mt-1 flex flex-wrap items-baseline gap-1.5 text-lg font-semibold text-white">
                    <span className="tabular-nums">{price.display}</span>
                    <span className="text-[10px] font-semibold tracking-[0.16em] text-white/60 uppercase">
                      {price.baseCode}
                    </span>
                  </p>
                  {price.localDisplay && (
                    <p className="mt-0.5 text-[11px] font-medium text-white/60 tabular-nums">
                      {price.localDisplay}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-brand/15 px-2.5 py-1 text-[11px] font-semibold text-brand-soft ring-1 ring-brand/30 ring-inset" lang={locale}>
                  {dict.hero.stats[1]?.value}
                </span>
              </div>

              <ul className="mt-1 grid w-full gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left">
                {dict.hero.checklist.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[13px] leading-snug font-medium text-white/90">
                    <span aria-hidden className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] ring-1 ring-emerald-400/40 ring-inset">
                      ✓
                    </span>
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

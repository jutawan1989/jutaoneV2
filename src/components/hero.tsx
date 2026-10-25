import Link from "next/link";
import { LogoMark } from "@/components/logo";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import type { Price } from "@/lib/pricing";

/**
 * Hero. The brand mark is the centrepiece: the globe that forms the O of JOB
 * spins via a single CSS transform (no video, no canvas), and stops under
 * `prefers-reduced-motion`.
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
    <section className="relative">
      <div className="mx-auto grid w-full max-w-6xl gap-14 px-4 pt-16 pb-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-24">
        <div>
          <p className="inline-flex items-center gap-2 rounded-md border border-line bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
            {dict.hero.eyebrow}
          </p>

          <h1 className="mt-7 text-4xl leading-[1.08] font-semibold tracking-[-0.025em] text-white sm:text-5xl">
            {dict.hero.title} <span className="text-brand">{dict.hero.titleAccent}</span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">
            {dict.hero.subtitle}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="#demo" className="btn-brand w-full sm:w-auto">
              {dict.hero.ctaPrimary}
            </Link>
            <Link href="#pricing" className="btn-ghost w-full sm:w-auto">
              {dict.hero.ctaSecondary}
            </Link>
          </div>

          <dl className="mt-11 grid grid-cols-3 gap-6 border-t border-line pt-6">
            {dict.hero.stats.map((stat) => (
              <div key={stat.label}>
                <dt className="text-lg font-semibold text-white tabular-nums sm:text-xl">
                  {stat.value}
                </dt>
                <dd className="mt-1.5 text-xs leading-snug text-muted">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative">
          <div className="card relative overflow-hidden p-7">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(22rem_14rem_at_50%_-10%,rgba(37,99,235,0.22),transparent_72%)]"
            />

            <div className="relative flex flex-col items-center gap-5">
              <LogoMark
                size={232}
                label={dict.a11y.globeLabel}
                className="w-full max-w-[232px]"
              />

              <p className="text-center text-[11px] font-semibold tracking-[0.2em] text-white uppercase">
                JutaOne<span className="text-brand">.Biz</span>
              </p>
              <p className="max-w-[18rem] text-center text-[11px] leading-relaxed text-muted">
                {dict.footer.tagline}
              </p>

              <div className="mt-2 flex w-full items-center justify-between rounded-lg border border-line bg-ink/50 px-4 py-3">
                <div>
                  <p className="text-[11px] tracking-[0.1em] text-muted uppercase">
                    {dict.pricing.tokenName}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white tabular-nums">
                    {price.display}
                  </p>
                </div>
                <span className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-silver" lang={locale}>
                  {dict.hero.stats[1]?.value}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

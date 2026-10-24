import Link from "next/link";
import { LogoMark } from "@/components/logo";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import type { Price } from "@/lib/pricing";

/**
 * "Moving billboard" hero. The brand mark is the centrepiece: the globe that
 * forms the O of JOB spins via a single CSS transform (no video, no canvas),
 * and stops under `prefers-reduced-motion`.
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
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 pt-14 pb-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold tracking-wide text-brand-soft uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            {dict.hero.eyebrow}
          </p>

          <h1 className="mt-6 text-4xl leading-[1.05] font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            {dict.hero.title}{" "}
            <span className="bg-gradient-to-r from-brand-soft via-brand to-brand-deep bg-clip-text text-transparent">
              {dict.hero.titleAccent}
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            {dict.hero.subtitle}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="#demo" className="btn-brand w-full sm:w-auto">
              {dict.hero.ctaPrimary}
            </Link>
            <Link href="#pricing" className="btn-ghost w-full sm:w-auto">
              {dict.hero.ctaSecondary}
            </Link>
          </div>

          <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-line/70 pt-6">
            {dict.hero.stats.map((stat) => (
              <div key={stat.label}>
                <dt className="text-lg font-bold text-white sm:text-xl">{stat.value}</dt>
                <dd className="mt-1 text-xs leading-snug text-muted sm:text-sm">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative">
          <div className="card relative overflow-hidden p-6">
            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.15]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.35) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
              }}
            />

            <div className="relative flex flex-col items-center gap-5 py-2">
              <LogoMark
                idPrefix="hero"
                size={272}
                label={dict.a11y.globeLabel}
                className="w-full max-w-[272px] drop-shadow-[0_20px_50px_rgba(63,169,245,0.35)]"
              />

              <p className="text-center text-[11px] font-semibold tracking-[0.22em] text-white/85 uppercase">
                JutaOne<span className="text-brand">.Biz</span>
              </p>
              <p className="max-w-[17rem] text-center text-[10px] leading-relaxed font-medium tracking-[0.06em] text-muted uppercase">
                {dict.footer.tagline}
              </p>

              <div className="mt-1 flex w-full items-center justify-between rounded-xl border border-line/80 bg-ink/60 px-4 py-3">
                <div>
                  <p className="text-xs text-muted">{dict.pricing.tokenName}</p>
                  <p className="text-lg font-bold text-white">{price.display}</p>
                </div>
                <span
                  className="rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold text-brand-soft"
                  lang={locale}
                >
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

import type { Dictionary } from "@/lib/i18n";
import { format, type Locale } from "@/lib/i18n/config";
import type { Variant } from "@/lib/analytics/variant";
import type { Price } from "@/lib/pricing";
import { TopUpButton } from "@/components/topup-button";

export function Pricing({
  locale,
  dict,
  price,
  variant,
}: {
  locale: Locale;
  dict: Dictionary;
  price: Price;
  variant: Variant;
}) {
  return (
    <section id="pricing" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
            {dict.pricing.title}
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">{dict.pricing.subtitle}</p>

          <ul className="mt-7 space-y-3">
            {dict.pricing.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-3 text-sm text-silver">
                <span aria-hidden className="mt-0.5 text-xs font-semibold text-brand">
                  ✓
                </span>
                {bullet}
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-6">
          <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
            {dict.pricing.tokenName}
          </p>
          {/* USD is the commercial price; the local amount is what the card is
              actually charged, so both are shown and the local figure is
              marked as an approximation of today's rate. */}
          <p className="mt-3 text-4xl font-semibold tracking-[-0.02em] text-white tabular-nums">
            {price.baseDisplay}
          </p>
          <p className="mt-1.5 text-sm text-silver tabular-nums">
            {format(dict.pricing.localApprox, { local: price.display })}
          </p>

          <div className="mt-6 border-t border-line pt-6">
            <TopUpButton
              locale={locale}
              variant={variant}
              errorText={dict.generator.errorGeneric}
              className="btn-brand w-full"
            >
              {dict.pricing.cta}
            </TopUpButton>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            {format(dict.pricing.topupNote, { currency: price.currency })}
          </p>
        </div>
      </div>
    </section>
  );
}

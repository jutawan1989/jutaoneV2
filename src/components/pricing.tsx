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
    <section id="pricing" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_0.85fr] lg:items-center">
        <div>
          <h2 className="text-2xl font-extrabold text-white sm:text-3xl">{dict.pricing.title}</h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">{dict.pricing.subtitle}</p>

          <ul className="mt-6 space-y-2.5">
            {dict.pricing.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2.5 text-sm text-silver">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gold/15 text-[10px] font-bold text-gold"
                >
                  ✓
                </span>
                {bullet}
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-6">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {dict.pricing.tokenName}
          </p>
          <p className="mt-2 text-4xl font-extrabold text-white">{price.display}</p>
          <p className="mt-1 text-xs text-muted">{dict.pricing.priceLabel}</p>

          <div className="mt-5">
            <TopUpButton
              locale={locale}
              variant={variant}
              errorText={dict.generator.errorGeneric}
              className="btn-gold w-full"
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

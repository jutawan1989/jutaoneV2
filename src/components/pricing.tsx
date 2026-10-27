"use client";

import { useId, useState } from "react";
import { Coins, Lock, ShieldCheck, Zap } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import type { Variant } from "@/lib/analytics/variant";
import {
  MIN_TOPUP_USD,
  QUICK_TOPUP_AMOUNTS,
  formatTokenCount,
  parseTopUpAmount,
  withUsdAmount,
  type Price,
} from "@/lib/pricing";
import { TopUpButton } from "@/components/topup-button";

/**
 * Premium fintech checkout card: amount picker on top, then the centered
 * order summary (tokens → price → email → CTA → trust badge). The card stays
 * a single column so it is clean on a 390px phone.
 */
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
  const [picked, setPicked] = useState<number | "custom">(1);
  const [custom, setCustom] = useState("");
  const customId = useId();

  const usd = picked === "custom" ? parseTopUpAmount(custom) : picked;
  const valid = usd !== null;
  const preview = withUsdAmount(price, valid ? (usd as number) : MIN_TOPUP_USD);

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

        <div className="panel relative mx-auto w-full max-w-md overflow-hidden p-6 sm:p-7">
          <div className="aurora -top-24 right-0 h-48 w-48 bg-brand/20" aria-hidden />
          <div className="relative">
            <p className="flex items-center gap-2 text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
              <Zap className="size-3.5 text-brand" aria-hidden />
              {dict.pricing.amountTitle}
            </p>

            <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label={dict.pricing.amountTitle}>
              {QUICK_TOPUP_AMOUNTS.map((amount) => {
                const active = picked === amount;
                return (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setPicked(amount)}
                    aria-pressed={active}
                    className={`min-h-[44px] rounded-xl border px-2 py-2.5 text-sm font-semibold tabular-nums transition-colors ${
                      active
                        ? "border-brand bg-brand/15 text-white shadow-[0_0_0_1px_var(--color-brand)]"
                        : "border-white/[0.08] bg-white/[0.02] text-silver hover:border-silver/40 hover:text-white"
                    }`}
                  >
                    ${amount}
                  </button>
                );
              })}
            </div>

            <div className="mt-3">
              <label
                htmlFor={customId}
                className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase"
              >
                {dict.pricing.customLabel}
              </label>
              <div className="relative mt-1.5">
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm font-semibold text-muted"
                >
                  $
                </span>
                <input
                  id={customId}
                  type="number"
                  inputMode="decimal"
                  min={MIN_TOPUP_USD}
                  step="0.01"
                  value={picked === "custom" ? custom : ""}
                  placeholder={dict.pricing.customPlaceholder}
                  onChange={(event) => {
                    setPicked("custom");
                    setCustom(event.target.value);
                  }}
                  onFocus={() => setPicked("custom")}
                  aria-invalid={picked === "custom" && custom !== "" && !valid}
                  className="min-h-[44px] w-full rounded-xl border border-white/[0.08] bg-white/[0.02] py-2.5 pr-3 pl-8 text-sm font-semibold text-white tabular-nums placeholder:font-normal placeholder:text-muted/70 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                />
              </div>
            </div>

            {!valid && picked === "custom" && custom !== "" && (
              <p role="alert" className="mt-2 text-xs text-red-300">
                {dict.pricing.invalidAmount}
              </p>
            )}

            <div className="seam my-6" aria-hidden />

            <div className="rounded-2xl border border-white/[0.07] bg-ink/60 px-5 py-5 text-center">
              <p className="flex items-center justify-center gap-1.5 text-[11px] font-medium tracking-[0.14em] text-muted uppercase">
                <Coins className="size-3.5 text-brand" aria-hidden />
                {dict.pricing.tokensFor}
              </p>
              <p className="mt-1.5 text-xl font-semibold break-words text-white sm:text-2xl">
                {valid ? formatTokenCount(preview.tokens, locale) : `— ${dict.pricing.tokenUnit}`}
              </p>

              <p className="mt-4 text-[44px] leading-none font-semibold tracking-[-0.03em] text-white tabular-nums">
                {preview.display}
                <span className="ml-2 align-middle text-xs font-semibold tracking-[0.16em] text-muted uppercase">
                  {preview.usdCode}
                </span>
              </p>
              {preview.localDisplay && (
                <p className="mt-2 text-sm font-medium text-silver tabular-nums">
                  {preview.localDisplay}
                </p>
              )}
              <p className="mt-1.5 text-xs text-muted">{dict.pricing.priceLabel}</p>
            </div>

            <div className="mt-5">
              <TopUpButton
                locale={locale}
                variant={variant}
                errorText={dict.generator.errorGeneric}
                emailErrorText={dict.pricing.invalidEmail}
                emailLabel={dict.pricing.emailLabel}
                emailPlaceholder={dict.pricing.emailPlaceholder}
                trustBadge={dict.pricing.trustBadge}
                className="btn-brand flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-base font-semibold"
                amountUsd={valid ? (usd as number) : undefined}
                disabled={!valid}
                collectEmail
              >
                {dict.pricing.proceed}
              </TopUpButton>
            </div>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] leading-relaxed text-muted">
              <ShieldCheck className="size-3.5 shrink-0 text-emerald-400" aria-hidden />
              {dict.pricing.topupNote.replace("{currency}", preview.currency)}
            </p>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-muted/80">
              <Lock className="size-3 shrink-0" aria-hidden />
              {dict.pricing.trustBadge}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

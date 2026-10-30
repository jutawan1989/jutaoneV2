"use client";

import { useId, useState } from "react";
import { Check, Coins, CreditCard, ShieldCheck, Zap } from "lucide-react";
import { PremiumArt } from "@/components/premium-art";
import type { Dictionary } from "@/lib/i18n";
import { format, type Locale } from "@/lib/i18n/config";
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
 * order summary (tokens → price → payment method → email → CTA → trust).
 * ToyyibPay (FPX) is CLOSED — Stripe card is the single payment method.
 * `gateway: "stripe"` is always sent via `/api/topup`.
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
  const customErrorId = `${customId}-error`;

  const usd = picked === "custom" ? parseTopUpAmount(custom) : picked;
  const valid = usd !== null;
  const preview = withUsdAmount(price, valid ? (usd as number) : MIN_TOPUP_USD, locale);

  return (
    <section id="pricing" className="mx-auto w-full max-w-6xl scroll-mt-24 bg-[#0A0F1D] px-5 py-12 sm:px-6 sm:py-20">
      <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
            {dict.pricing.title}
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-300">{dict.pricing.subtitle}</p>

          <ul className="mt-7 space-y-3">
            {dict.pricing.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-3 text-sm text-silver">
                <span
                  aria-hidden
                  className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-400/10 ring-1 ring-emerald-400/30 ring-inset"
                >
                  <Check className="size-3 text-emerald-300" strokeWidth={3} />
                </span>
                {bullet}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0B1220] p-6 shadow-sm sm:p-7">
          <div className="relative">
            <p className="flex items-center gap-2 text-xs font-medium tracking-[0.12em] text-slate-300 uppercase">
              <Zap className="size-3.5 text-brand-soft" aria-hidden />
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
                    className={`min-h-[44px] rounded-xl border px-2 py-2.5 text-sm font-semibold tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1220] focus-visible:outline-none ${
                      active
                        ? "border-brand bg-brand/10 text-white shadow-[0_0_0_1px_var(--color-brand)]"
                        : "border-white/10 bg-white/[0.03] text-silver hover:border-white/25 hover:text-white"
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
                className="text-xs font-medium tracking-[0.12em] text-slate-300 uppercase"
              >
                {dict.pricing.customLabel}
              </label>
              <div className="relative mt-1.5">
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm font-semibold text-slate-300"
                >
                  $
                </span>
                <input
                  id={customId}
                  type="text"
                  inputMode="decimal"
                  pattern="^[0-9]*[.]?[0-9]*$"
                  autoComplete="off"
                  value={picked === "custom" ? custom : ""}
                  placeholder={dict.pricing.customPlaceholder}
                  onChange={(event) => {
                    setPicked("custom");
                    setCustom(event.target.value);
                  }}
                  onFocus={() => setPicked("custom")}
                  aria-invalid={picked === "custom" && custom !== "" && !valid}
                  aria-describedby={picked === "custom" && custom !== "" && !valid ? customErrorId : undefined}
                  className="min-h-[44px] w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pr-3 pl-8 text-sm font-semibold text-white tabular-nums placeholder:font-normal placeholder:text-slate-400 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                />
              </div>
            </div>

            {!valid && picked === "custom" && custom !== "" && (
              <p id={customErrorId} role="alert" className="mt-2 text-xs font-medium text-red-300">
                {dict.pricing.invalidAmount}
              </p>
            )}

            <div className="my-6 h-px bg-white/[0.06]" aria-hidden />

            {/* Value-stack: agency anchor vs RM4.70 bundle (conversion spec). */}
            <div className="mb-4 rounded-xl border border-blue-500/25 bg-blue-500/[0.07] px-4 py-3 text-center">
              <p className="text-xs font-medium tracking-[0.12em] text-slate-300 uppercase">
                {dict.pricing.agencyLabel}{" "}
                <s className="font-bold text-red-300 tabular-nums">{dict.pricing.agencyWas}</s>
              </p>
              <p className="mt-1 text-lg leading-snug font-bold break-words text-white">
                {dict.pricing.agencyNow}{" "}
                <span className="text-xs font-semibold text-emerald-300">
                  · {dict.pricing.agencyIncludes}
                </span>
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-5 text-center">
              <div className="flex justify-center">
                <PremiumArt src="/assets/token.jpg" alt={dict.pricing.tokensFor} size={64} glow="cyan" />
              </div>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium tracking-[0.14em] text-slate-300 uppercase">
                <Coins className="size-3.5 text-brand-soft" aria-hidden />
                {dict.pricing.tokensFor}
              </p>
              <p className="mt-1.5 text-xl font-semibold break-words text-white sm:text-2xl">
                {valid ? formatTokenCount(preview.tokens, locale) : `— ${dict.pricing.tokenUnit}`}
              </p>

              <p className="mt-4 text-[44px] leading-none font-semibold tracking-[-0.03em] text-white tabular-nums">
                {preview.display}
                <span className="ml-2 align-middle text-xs font-semibold tracking-[0.16em] text-slate-300 uppercase">
                  {preview.baseCode}
                </span>
              </p>
              {preview.localDisplay && (
                <p className="mt-2 text-sm font-medium text-slate-300 tabular-nums">
                  {preview.localDisplay}
                </p>
              )}
              <p className="mt-1.5 text-xs text-slate-300">{dict.pricing.priceLabel}</p>
            </div>

            {/* Payment method: ToyyibPay CLOSED — Stripe card only. */}
            <div className="mt-5">
              <p className="text-xs font-medium tracking-[0.12em] text-slate-300 uppercase">
                {dict.pricing.paymentMethodTitle}
              </p>
              <div className="mt-2.5 flex min-h-[52px] items-center gap-2.5 rounded-xl border border-[#2E6BFF] bg-[#1D4ED8]/15 px-3 py-3 shadow-[0_0_0_1px_#2E6BFF,0_8px_24px_-8px_rgba(46,107,255,0.55)] sm:gap-3 sm:px-4">
                <CreditCard className="size-5 shrink-0 text-[#7AA5FF]" aria-hidden />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-[13px] leading-snug font-semibold break-words text-white sm:text-sm">
                    {dict.pricing.stripeTitle}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug break-words text-slate-400">
                    {dict.pricing.stripeNote}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-[#1D4ED8]/30 px-2 py-1 text-[10px] font-bold tracking-wide whitespace-nowrap text-[#BFD2FF] uppercase ring-1 ring-[#2E6BFF]/50 ring-inset sm:text-[11px]">
                  {dict.pricing.comingSoon}
                </span>
              </div>
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
                className="btn-brand btn-glow cta-glow flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-base font-bold"
                amountUsd={valid ? (usd as number) : undefined}
                disabled={!valid}
                collectEmail
                gateway="stripe"
              >
                {dict.pricing.proceed}
              </TopUpButton>
            </div>

            <div className="mt-3 space-y-1.5 text-center text-xs leading-relaxed text-slate-300">
              <p className="flex items-center justify-center gap-1.5">
                <ShieldCheck className="size-3.5 shrink-0 text-emerald-400" aria-hidden />
                {format(dict.pricing.topupNote, { currency: preview.currency })}
              </p>
              <p className="font-medium">
                <span aria-hidden>💳 </span>
                {dict.pricing.stripeTitle} · {dict.pricing.stripeNote}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

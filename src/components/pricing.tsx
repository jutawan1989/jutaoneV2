"use client";

import { useId, useState } from "react";
import { Coins, Lock, ShieldCheck, Zap } from "lucide-react";
import { PremiumArt } from "@/components/premium-art";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import type { Variant } from "@/lib/analytics/variant";
import {
  MIN_TOPUP_USD,
  QUICK_TOPUP_AMOUNTS,
  TOYYIBPAY_FEE_RM,
  formatRm,
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
  const preview = withUsdAmount(price, valid ? (usd as number) : MIN_TOPUP_USD, locale);

  return (
    <section id="pricing" className="mx-auto w-full max-w-6xl scroll-mt-24 bg-[#0A0F1D] px-5 py-12 sm:px-6 sm:py-20">
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

        <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0B1220] p-6 shadow-sm sm:p-7">
          <div className="relative">
            <p className="flex items-center gap-2 text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
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
                    className={`min-h-[44px] rounded-xl border px-2 py-2.5 text-sm font-semibold tabular-nums transition-colors ${
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
                  className="min-h-[44px] w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pr-3 pl-8 text-sm font-semibold text-white tabular-nums placeholder:font-normal placeholder:text-muted/60 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                />
              </div>
            </div>

            {!valid && picked === "custom" && custom !== "" && (
              <p role="alert" className="mt-2 text-xs text-red-300">
                {dict.pricing.invalidAmount}
              </p>
            )}

            <div className="my-6 h-px bg-white/[0.06]" aria-hidden />

            {/* Value-stack: agency anchor vs RM4.70 bundle (conversion spec). */}
            <div className="mb-4 rounded-xl border border-blue-500/25 bg-blue-500/[0.07] px-4 py-3 text-center">
              <p className="text-[11px] font-medium tracking-[0.12em] text-white/60 uppercase">
                {locale === "en" ? "Agency cost:" : locale === "id" ? "Biaya agensi:" : "Kos agensi:"}{" "}
                <s className="font-bold text-red-300/90 tabular-nums">
                  {locale === "en" ? "$320+" : locale === "id" ? "Rp5 Jt+" : "RM1,500+"}
                </s>
              </p>
              <p className="mt-1 text-lg font-bold text-white">
                {locale === "en" ? "Only $1" : locale === "id" ? "Hanya Rp18rb" : "Hanya RM4.70"}{" "}
                <span className="text-[11px] font-semibold text-emerald-300">
                  · AI Writer + Store + Biz-Match + Metals
                </span>
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-5 text-center">
              <div className="flex justify-center">
                <PremiumArt src="/assets/token.jpg" alt={dict.pricing.tokensFor} size={64} glow="cyan" />
              </div>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-medium tracking-[0.14em] text-muted uppercase">
                <Coins className="size-3.5 text-brand-soft" aria-hidden />
                {dict.pricing.tokensFor}
              </p>
              <p className="mt-1.5 text-xl font-semibold break-words text-white sm:text-2xl">
                {valid ? formatTokenCount(preview.tokens, locale) : `— ${dict.pricing.tokenUnit}`}
              </p>

              <p className="mt-4 text-[44px] leading-none font-semibold tracking-[-0.03em] text-white tabular-nums">
                {preview.display}
                <span className="ml-2 align-middle text-xs font-semibold tracking-[0.16em] text-muted uppercase">
                  {preview.baseCode}
                </span>
              </p>
              {preview.localDisplay && (
                <p className="mt-2 text-sm font-medium text-muted tabular-nums">
                  {preview.localDisplay}
                </p>
              )}
              {preview.currency === "MYR" && valid && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800 tabular-nums ring-1 ring-amber-200 ring-inset">
                  {dict.pricing.feeLine
                    .replace("{base}", formatRm(usd as number))
                    .replace("{fee}", `RM${TOYYIBPAY_FEE_RM.toFixed(2)}`)
                    .replace("{total}", formatRm((usd as number) + TOYYIBPAY_FEE_RM / 4.7))}
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
                className="btn-brand btn-glow cta-glow flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-base font-bold"
                amountUsd={valid ? (usd as number) : undefined}
                disabled={!valid}
                collectEmail
              >
                {dict.pricing.proceed}
              </TopUpButton>
            </div>

            <div className="mt-3 space-y-1.5 text-center text-[11px] leading-relaxed text-muted">
              <p className="flex items-center justify-center gap-1.5">
                <ShieldCheck className="size-3.5 shrink-0 text-emerald-400" aria-hidden />
                {dict.pricing.topupNote.replace("{currency}", preview.currency)}
              </p>
              <p className="font-medium">
                🇲🇾 {dict.pricing.toyyibpayNote} · 🌍 {dict.pricing.chipNote}
              </p>
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-muted/70">
              <Lock className="size-3 shrink-0" aria-hidden />
              {dict.pricing.trustBadge}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

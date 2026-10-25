"use client";

import { useId, useState } from "react";
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
 * Dynamic top-up card: $1 base headline, quick picks ($1/$5/$10/$50) plus a
 * custom amount, and a live token preview that scales at 1M tokens per USD.
 * The card stays a single column so it is clean on a 390px phone.
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

        <div className="card p-6">
          <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
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
                  className={`rounded-lg border px-2 py-2.5 text-sm font-semibold tabular-nums transition-colors ${
                    active
                      ? "border-brand bg-brand/15 text-white"
                      : "border-line bg-white/[0.02] text-silver hover:border-silver/40 hover:text-white"
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
                className="w-full rounded-lg border border-line bg-white/[0.02] py-2.5 pr-3 pl-8 text-sm font-semibold text-white tabular-nums placeholder:font-normal placeholder:text-muted/70 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-line bg-ink/50 px-4 py-4">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-semibold tracking-[-0.03em] text-white tabular-nums">
                {preview.display}
              </span>
              <span className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
                {preview.usdCode}
              </span>
            </div>
            {preview.localDisplay && (
              <p className="mt-1.5 text-sm font-medium text-silver tabular-nums">
                {preview.localDisplay}
              </p>
            )}
            <p className="mt-2 text-sm text-muted" aria-live="polite">
              {dict.pricing.tokensFor}{" "}
              <span className="font-semibold text-white tabular-nums">
                {valid ? formatTokenCount(preview.tokens, locale) : `— ${dict.pricing.tokenUnit}`}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted">{dict.pricing.priceLabel}</p>
          </div>

          {!valid && picked === "custom" && custom !== "" && (
            <p role="alert" className="mt-2 text-xs text-red-300">
              {dict.pricing.invalidAmount}
            </p>
          )}

          <div className="mt-5">
            <TopUpButton
              locale={locale}
              variant={variant}
              errorText={dict.generator.errorGeneric}
              className="btn-brand w-full"
              amountUsd={valid ? (usd as number) : undefined}
              disabled={!valid}
            >
              {dict.pricing.proceed}
            </TopUpButton>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            {dict.pricing.topupNote.replace("{currency}", preview.currency)}
          </p>
        </div>
      </div>
    </section>
  );
}

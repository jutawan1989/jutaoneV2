"use client";

import { useState } from "react";
import { Calculator, Clock3, PiggyBank, TrendingUp } from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n";
import {
  calculateSavings,
  DEFAULT_HOURLY_RATE,
  defaultSavingsCurrency,
  formatSavingsMoney,
  MAX_ADS_PER_WEEK,
  MAX_MINUTES_PER_AD,
  MIN_ADS_PER_WEEK,
  MIN_MINUTES_PER_AD,
  SAVINGS_CURRENCIES,
  type SavingsCurrency,
} from "@/lib/savings";

/**
 * Kalkulator Penjimatan Masa — homepage section, Corporate Blue theme.
 *
 * Anchor is USD; [USD][MYR][IDR] only switches the display currency.
 * Copy is estimate-only ("anggaran") — no profit promises, per compliance.
 */
export function SavingsCalculator({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const copy = dict.savings;
  const [currency, setCurrency] = useState<SavingsCurrency>(() => defaultSavingsCurrency(locale));
  const [adsPerWeek, setAdsPerWeek] = useState(10);
  const [minutesPerAd, setMinutesPerAd] = useState(30);
  const [hourlyRate, setHourlyRate] = useState(() => DEFAULT_HOURLY_RATE[defaultSavingsCurrency(locale)]);

  const result = calculateSavings({ adsPerWeek, minutesPerAd, hourlyRate, currency });

  function switchCurrency(next: SavingsCurrency) {
    setCurrency(next);
    setHourlyRate(DEFAULT_HOURLY_RATE[next]);
  }

  const sliderClass =
    "w-full accent-[#2E6BFF] min-h-[44px] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#7AA5FF]";
  const inputClass =
    "min-h-[44px] w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm font-semibold text-white tabular-nums focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none";

  return (
    <section id="savings" aria-labelledby="savings-title" className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 sm:py-20">
      <div className="relative overflow-hidden rounded-2xl border border-[#2E6BFF]/40 bg-[#0B1220] p-6 shadow-[0_0_0_1px_#2E6BFF,0_8px_40px_-8px_rgba(46,107,255,0.45)] sm:p-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="flex items-center justify-center gap-2 text-xs font-medium tracking-[0.12em] text-[#7AA5FF] uppercase">
            <Calculator className="size-4" aria-hidden />
            {copy.eyebrow}
          </p>
          <h2 id="savings-title" className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
            {copy.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">{copy.subtitle}</p>
        </div>

        {/* Currency toggle [USD] [MYR] [IDR] */}
        <div className="mx-auto mt-6 flex max-w-xs items-center justify-center">
          <div
            role="group"
            aria-label={copy.currencyLabel}
            className="grid w-full grid-cols-3 gap-1 rounded-xl border border-[#2E6BFF]/40 bg-[#1D4ED8]/15 p-1"
          >
            {SAVINGS_CURRENCIES.map((code) => {
              const active = currency === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => switchCurrency(code)}
                  aria-pressed={active}
                  className={`min-h-[44px] rounded-lg px-2 text-sm font-bold tracking-wide transition-colors focus-visible:ring-2 focus-visible:ring-[#7AA5FF] focus-visible:outline-none ${
                    active ? "bg-[#1D4ED8] text-white shadow" : "text-[#BFD2FF] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {code}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mx-auto mt-8 grid max-w-4xl gap-8 lg:grid-cols-[1fr_1fr] lg:gap-10">
          {/* Inputs */}
          <div className="space-y-6">
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="savings-ads" className="text-sm font-semibold text-white">
                  {copy.adsLabel}
                </label>
                <output htmlFor="savings-ads" className="text-sm font-bold text-[#7AA5FF] tabular-nums">
                  {adsPerWeek}
                </output>
              </div>
              <input
                id="savings-ads"
                type="range"
                min={MIN_ADS_PER_WEEK}
                max={MAX_ADS_PER_WEEK}
                step={1}
                value={adsPerWeek}
                onChange={(event) => setAdsPerWeek(Number(event.target.value))}
                className={sliderClass}
                aria-describedby="savings-ads-hint"
              />
              <p id="savings-ads-hint" className="text-xs text-slate-400">
                {copy.adsHint}
              </p>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="savings-minutes" className="text-sm font-semibold text-white">
                  {copy.minutesLabel}
                </label>
                <output htmlFor="savings-minutes" className="text-sm font-bold text-[#7AA5FF] tabular-nums">
                  {minutesPerAd} {copy.minutesUnit}
                </output>
              </div>
              <input
                id="savings-minutes"
                type="range"
                min={MIN_MINUTES_PER_AD}
                max={MAX_MINUTES_PER_AD}
                step={1}
                value={minutesPerAd}
                onChange={(event) => setMinutesPerAd(Number(event.target.value))}
                className={sliderClass}
              />
            </div>

            <div>
              <label htmlFor="savings-hourly" className="text-sm font-semibold text-white">
                {copy.hourlyLabel}
              </label>
              <div className="relative mt-1.5">
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm font-semibold text-slate-300"
                >
                  {currency === "USD" ? "$" : currency === "MYR" ? "RM" : "Rp"}
                </span>
                <input
                  id="savings-hourly"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={Number.isFinite(hourlyRate) ? hourlyRate : ""}
                  onChange={(event) => setHourlyRate(Number(event.target.value))}
                  className={`${inputClass} pl-11`}
                  aria-describedby="savings-hourly-hint"
                />
              </div>
              <p id="savings-hourly-hint" className="mt-1.5 text-xs text-slate-400">
                {copy.hourlyHint}
              </p>
            </div>
          </div>

          {/* Results */}
          <div aria-live="polite" className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-6 sm:px-6">
            <p className="text-xs font-medium tracking-[0.12em] text-slate-300 uppercase">{copy.resultsTitle}</p>
            <dl className="mt-4 space-y-4">
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 size-5 shrink-0 text-[#7AA5FF]" aria-hidden />
                <div>
                  <dt className="text-xs text-slate-400">{copy.hoursSaved}</dt>
                  <dd className="text-2xl font-bold text-white tabular-nums">
                    {result.hoursSaved.toLocaleString("en-US")} {copy.hoursUnit}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <PiggyBank className="mt-0.5 size-5 shrink-0 text-emerald-300" aria-hidden />
                <div>
                  <dt className="text-xs text-slate-400">{copy.moneySaved}</dt>
                  <dd className="text-2xl font-bold text-white tabular-nums">
                    {formatSavingsMoney(result.moneySaved, currency)}
                    <span className="ml-1 align-middle text-xs font-semibold text-slate-300">{copy.perMonth}</span>
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <TrendingUp className="mt-0.5 size-5 shrink-0 text-[#7AA5FF]" aria-hidden />
                <div>
                  <dt className="text-xs text-slate-400">{copy.roiLabel}</dt>
                  <dd className="text-2xl font-bold text-white tabular-nums">
                    {result.roiMultiple.toLocaleString("en-US")}×
                  </dd>
                </div>
              </div>
            </dl>
            <p className="mt-5 text-xs leading-relaxed text-slate-400">
              {format(copy.tokensLine, { tokens: result.tokensPerMonth.toLocaleString("en-US") })}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{copy.estimateNote}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

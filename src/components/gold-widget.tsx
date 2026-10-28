"use client";

import { useEffect, useState } from "react";
import { PremiumArt } from "@/components/premium-art";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import type { PublicMetalCurrency } from "@/lib/goldprice";

type MetalApiResponse = {
  ok?: boolean;
  currency?: string;
  gold?: number | null;
  silver?: number | null;
  source?: "live" | "cache";
  fetchedAt?: string;
};

type SinglePrices = {
  status: "loading" | "ready" | "unavailable";
  gold: number | null;
  silver: number | null;
  fetchedAt: string | null;
};

/** Boss spec (Global Startup): one currency per locale — ms→RM, id→Rp, en→USD. */
function currencyForLocale(locale: Locale): PublicMetalCurrency {
  if (locale === "id") return "IDR";
  if (locale === "en") return "USD";
  return "MYR";
}

function formatPrice(value: number | null, currency: PublicMetalCurrency): string {
  if (value === null || value === undefined) return "—";
  try {
    const tag = currency === "IDR" ? "id-ID" : currency === "USD" ? "en-US" : "ms-MY";
    return new Intl.NumberFormat(tag, {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "IDR" ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-US")}`;
  }
}

async function fetchOne(currency: PublicMetalCurrency): Promise<MetalApiResponse | null> {
  try {
    const res = await fetch(`/api/metals/public?currency=${currency}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as MetalApiResponse;
  } catch {
    return null;
  }
}

/**
 * Homepage metals widget — FREE Goldprice.dev feed (cached 4h server-side).
 *
 * Single-currency display: the quote follows the active locale
 * (ms→MYR, id→IDR, en→USD raw spot). No BUY/SELL/HOLD signals here: signals
 * live in the premium dashboard analysis (2,000 tokens), not on the free
 * page — the free page must never look like investment advice. The compliance
 * disclaimer stays. When the feed is down, the widget hides itself rather
 * than showing stale-looking numbers.
 */
export function GoldWidget({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const currency = currencyForLocale(locale);
  const [prices, setPrices] = useState<SinglePrices>({
    status: "loading",
    gold: null,
    silver: null,
    fetchedAt: null,
  });

  useEffect(() => {
    let cancelled = false;
    setPrices({ status: "loading", gold: null, silver: null, fetchedAt: null });
    fetchOne(currency).then((res) => {
      if (cancelled) return;
      if (!res?.ok || (res.gold == null && res.silver == null)) {
        setPrices((prev) => ({ ...prev, status: "unavailable" }));
        return;
      }
      setPrices({
        status: "ready",
        gold: res.gold ?? null,
        silver: res.silver ?? null,
        fetchedAt: res.fetchedAt ?? null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [currency]);

  if (prices.status === "unavailable") return null;

  let updatedLabel: string | null = null;
  if (prices.fetchedAt) {
    try {
      updatedLabel = new Date(prices.fetchedAt).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      updatedLabel = null;
    }
  }

  const rows = [
    {
      name: dict.gold.instruments.gold,
      price: prices.status === "ready" ? `${formatPrice(prices.gold, currency)}${dict.gold.perOunce}` : "…",
      art: "/assets/gold.jpg",
      glow: "gold" as const,
    },
    {
      name: dict.gold.instruments.silver,
      price: prices.status === "ready" ? `${formatPrice(prices.silver, currency)}${dict.gold.perOunce}` : "…",
      art: "/assets/silver.jpg",
      glow: "silver" as const,
    },
  ];

  return (
    <section id="gold" className="scroll-mt-24 border-y border-slate-200 bg-sky-50 py-20">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div className="order-2 lg:order-1">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900 sm:text-3xl">
            {dict.gold.title}
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-600">{dict.gold.subtitle}</p>
          <p className="mt-6 max-w-lg border-l-2 border-brand/60 pl-4 text-sm leading-relaxed text-slate-700">
            {dict.gold.note}
          </p>
        </div>

        <div className="order-1 flex justify-center lg:order-2">
          <div className="widget-float w-[20rem] max-w-full">
            <div
              role="group"
              aria-label={dict.gold.screenTitle}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium tracking-[0.12em] text-slate-500 uppercase">
                    {dict.gold.screenTitle}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">{dict.gold.priceRow}</p>
                </div>
                <span className="flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium tracking-[0.1em] text-emerald-600 uppercase">
                  <span aria-hidden className="signal-live h-1 w-1 rounded-full bg-emerald-500" />
                  {dict.gold.liveBadge}
                </span>
              </div>

              <ul className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
                {rows.map((row) => (
                  <li key={row.name} className="signal-row flex items-center justify-between gap-3 py-3.5">
                    <span className="flex min-w-0 items-center gap-3">
                      <PremiumArt src={row.art} alt={row.name} size={44} glow={row.glow} rounded="rounded-xl" />
                      <span className="truncate text-sm font-medium text-slate-700">{row.name}</span>
                    </span>
                    <span className="text-base font-semibold text-slate-900 tabular-nums">{row.price}</span>
                  </li>
                ))}
              </ul>

              {updatedLabel && (
                <p className="mt-3 text-[11px] text-slate-500">
                  {dict.gold.updatedAt}: {updatedLabel}
                </p>
              )}
              <p className="mt-4 text-[10px] leading-relaxed text-slate-500">{dict.gold.disclaimer}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

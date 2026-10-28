"use client";

import { useEffect, useState } from "react";
import { PremiumArt } from "@/components/premium-art";
import type { Dictionary } from "@/lib/i18n";

type MetalApiResponse = {
  ok?: boolean;
  currency?: string;
  gold?: number | null;
  silver?: number | null;
  source?: "live" | "cache";
  fetchedAt?: string;
};

type DualPrices = {
  status: "loading" | "ready" | "unavailable";
  myr: { gold: number | null; silver: number | null; fetchedAt: string | null };
  idr: { gold: number | null; silver: number | null; fetchedAt: string | null };
};

function formatPrice(value: number | null, currency: "MYR" | "IDR"): string {
  if (value === null || value === undefined) return "—";
  try {
    return new Intl.NumberFormat(currency === "IDR" ? "id-ID" : "ms-MY", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "IDR" ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-US")}`;
  }
}

async function fetchOne(currency: "MYR" | "IDR"): Promise<MetalApiResponse | null> {
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
 * Label "Harga Pasaran Semasa" (dict.gold.screenTitle) with real converted
 * spot prices per troy ounce. No BUY/SELL/HOLD signals here: signals live in
 * the premium dashboard analysis (2,000 tokens), not on the free page — the
 * free page must never look like investment advice. The compliance disclaimer
 * stays. When the feed is down, the widget hides itself rather than showing
 * stale-looking numbers.
 */
export function GoldWidget({ dict }: { dict: Dictionary }) {
  const [prices, setPrices] = useState<DualPrices>({
    status: "loading",
    myr: { gold: null, silver: null, fetchedAt: null },
    idr: { gold: null, silver: null, fetchedAt: null },
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchOne("MYR"), fetchOne("IDR")]).then(([myr, idr]) => {
      if (cancelled) return;
      const hasAny =
        (myr?.ok && (myr.gold != null || myr.silver != null)) ||
        (idr?.ok && (idr.gold != null || idr.silver != null));
      if (!hasAny) {
        setPrices((prev) => ({ ...prev, status: "unavailable" }));
        return;
      }
      setPrices({
        status: "ready",
        myr: { gold: myr?.gold ?? null, silver: myr?.silver ?? null, fetchedAt: myr?.fetchedAt ?? null },
        idr: { gold: idr?.gold ?? null, silver: idr?.silver ?? null, fetchedAt: idr?.fetchedAt ?? null },
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (prices.status === "unavailable") return null;

  const updatedRaw = prices.myr.fetchedAt ?? prices.idr.fetchedAt;
  let updatedLabel: string | null = null;
  if (updatedRaw) {
    try {
      updatedLabel = new Date(updatedRaw).toLocaleString(undefined, {
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
      myr: prices.status === "ready" ? `${formatPrice(prices.myr.gold, "MYR")}${dict.gold.perOunce}` : "…",
      idr: prices.status === "ready" ? `${formatPrice(prices.idr.gold, "IDR")}${dict.gold.perOunce}` : "…",
      art: "/assets/gold.jpg",
      glow: "gold" as const,
    },
    {
      name: dict.gold.instruments.silver,
      myr: prices.status === "ready" ? `${formatPrice(prices.myr.silver, "MYR")}${dict.gold.perOunce}` : "…",
      idr: prices.status === "ready" ? `${formatPrice(prices.idr.silver, "IDR")}${dict.gold.perOunce}` : "…",
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
                    <span className="text-right">
                      <span className="block text-sm font-semibold text-slate-900 tabular-nums">{row.myr}</span>
                      <span className="mt-0.5 block text-[11px] font-medium text-slate-500 tabular-nums">{row.idr}</span>
                    </span>
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

"use client";

import { useEffect, useState } from "react";
import { PremiumArt } from "@/components/premium-art";
import type { Dictionary } from "@/lib/i18n";

const SIGNALS = ["buy", "sell", "hold"] as const;
type SignalKey = (typeof SIGNALS)[number];

/**
 * Signals stay readable without turning the card into a traffic light: a dot
 * carries the colour, the label carries the meaning.
 */
const SIGNAL_DOT: Record<SignalKey, string> = {
  buy: "bg-emerald-400",
  sell: "bg-rose-400",
  hold: "bg-amber-400",
};

const SIGNAL_TEXT: Record<SignalKey, string> = {
  buy: "text-emerald-600",
  sell: "text-rose-600",
  hold: "text-amber-600",
};

/**
 * D2 — simulated gold/silver signal widget. Everything on screen is generated
 * locally and labelled as a simulation; no prices, returns or performance
 * figures are shown, and no investment advice is given.
 */
export function GoldWidget({ dict }: { dict: Dictionary }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 3200);
    return () => clearInterval(id);
  }, []);

  const rows = [
    {
      name: dict.gold.instruments.gold,
      signal: SIGNALS[tick % SIGNALS.length],
      art: "/assets/gold.jpg",
      glow: "gold" as const,
    },
    {
      name: dict.gold.instruments.silver,
      signal: SIGNALS[(tick + 1) % SIGNALS.length],
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
                <span className="flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium tracking-[0.1em] text-slate-500 uppercase">
                  <span aria-hidden className="signal-live h-1 w-1 rounded-full bg-emerald-500" />
                  SIM
                </span>
              </div>

              <ul className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
                {rows.map((row) => (
                  <li key={row.name} className="signal-row flex items-center justify-between gap-3 py-3.5">
                    <span className="flex min-w-0 items-center gap-3">
                      <PremiumArt src={row.art} alt={row.name} size={44} glow={row.glow} rounded="rounded-xl" />
                      <span className="truncate text-sm font-medium text-slate-700">{row.name}</span>
                    </span>
                    <span
                      className={`flex items-center gap-2 text-[11px] font-semibold tracking-[0.1em] ${SIGNAL_TEXT[row.signal]}`}
                    >
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 rounded-full ${SIGNAL_DOT[row.signal]}`}
                      />
                      {dict.gold.signals[row.signal]}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-[10px] leading-relaxed text-slate-500">{dict.gold.disclaimer}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

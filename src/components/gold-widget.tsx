"use client";

import { useEffect, useState } from "react";
import type { Dictionary } from "@/lib/i18n";

const SIGNALS = ["buy", "sell", "hold"] as const;
type SignalKey = (typeof SIGNALS)[number];

const SIGNAL_STYLES: Record<SignalKey, string> = {
  buy: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  sell: "bg-red-500/15 text-red-300 border-red-500/30",
  hold: "bg-amber-500/15 text-amber-300 border-amber-500/30",
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
    { name: dict.gold.instruments.gold, signal: SIGNALS[tick % SIGNALS.length] },
    { name: dict.gold.instruments.silver, signal: SIGNALS[(tick + 1) % SIGNALS.length] },
  ];

  return (
    <section id="gold" className="scroll-mt-24 border-y border-line/60 bg-white/[0.015] py-16">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div className="order-2 lg:order-1">
          <h2 className="text-2xl font-extrabold text-white sm:text-3xl">{dict.gold.title}</h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">{dict.gold.subtitle}</p>
          <p className="mt-5 max-w-lg rounded-xl border border-brand/25 bg-brand/[0.06] p-4 text-sm leading-relaxed text-brand-soft">
            {dict.gold.note}
          </p>
        </div>

        <div className="order-1 flex justify-center lg:order-2">
          <div className="widget-float w-[19rem] max-w-full rounded-[2.2rem] border border-line bg-ink-2 p-3 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.95)]">
            <div
              role="group"
              aria-label={dict.gold.screenTitle}
              className="overflow-hidden rounded-[1.7rem] border border-line/80 bg-gradient-to-b from-surface-2 to-ink p-4"
            >
              <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-line" aria-hidden />

              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">{dict.gold.screenTitle}</p>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-emerald-300 uppercase">
                  <span className="signal-live h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  SIM
                </span>
              </div>

              <p className="mt-1 text-[10px] tracking-wide text-muted uppercase">{dict.gold.priceRow}</p>

              <ul className="mt-4 space-y-2">
                {rows.map((row) => (
                  <li
                    key={row.name}
                    className="signal-row flex items-center justify-between rounded-xl border border-line/70 bg-ink/60 px-3 py-2.5"
                  >
                    <span className="text-sm font-medium text-silver">{row.name}</span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${SIGNAL_STYLES[row.signal]}`}
                    >
                      {dict.gold.signals[row.signal]}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                <p className="text-[11px] leading-snug font-semibold text-brand-soft">
                  {dict.gold.disclaimer}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
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
  buy: "text-emerald-300",
  sell: "text-rose-300",
  hold: "text-amber-300",
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
    <section id="gold" className="scroll-mt-24 border-y border-line bg-white/[0.012] py-20">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div className="order-2 lg:order-1">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
            {dict.gold.title}
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">{dict.gold.subtitle}</p>
          <p className="mt-6 max-w-lg border-l-2 border-brand/60 pl-4 text-sm leading-relaxed text-silver">
            {dict.gold.note}
          </p>
        </div>

        <div className="order-1 flex justify-center lg:order-2">
          <div className="widget-float w-[20rem] max-w-full">
            <div
              role="group"
              aria-label={dict.gold.screenTitle}
              className="overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-surface-2 to-[#070d19] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_28px_70px_-44px_rgba(0,0,0,0.95)]"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
                    {dict.gold.screenTitle}
                  </p>
                  <p className="mt-1 text-[11px] text-muted/80">{dict.gold.priceRow}</p>
                </div>
                <span className="flex items-center gap-1.5 rounded border border-line bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium tracking-[0.1em] text-muted uppercase">
                  <span aria-hidden className="signal-live h-1 w-1 rounded-full bg-emerald-400" />
                  SIM
                </span>
              </div>

              <ul className="mt-5 divide-y divide-line/80 border-y border-line/80">
                {rows.map((row) => (
                  <li key={row.name} className="signal-row flex items-center justify-between py-3.5">
                    <span className="text-sm font-medium text-silver">{row.name}</span>
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

              <p className="mt-4 text-[10px] leading-relaxed text-muted/85">{dict.gold.disclaimer}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

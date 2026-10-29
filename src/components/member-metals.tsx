"use client";

import { useState } from "react";
import { Coins, Loader2, TrendingDown, TrendingUp, Minus, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mirrored from `METALS_COST_TOKENS` in `lib/tokens.ts`. That module imports
 * the Supabase server client, so importing the constant directly would drag
 * the service-role SDK into this client bundle.
 */
const METALS_COST_TOKENS = 2_000;

type MetalQuote = {
  symbol: string;
  currency: string;
  mid: number | null;
  bid: number | null;
  ask: number | null;
  high: number | null;
  low: number | null;
  change: number | null;
  changePercentage: number | null;
  trend: "up" | "down" | "flat" | null;
  karatPrices: Record<string, number> | null;
  finenessPrices: Record<string, number> | null;
  ai_signal?: "BELI" | "JUAL" | "SIMPAN" | null;
  signal_reason?: string | null;
};

type MetalsResponse = {
  ok?: boolean;
  currency?: string;
  gold?: MetalQuote | null;
  silver?: MetalQuote | null;
  fetchedAt?: string;
  code?: string;
  required?: number;
  balance?: number;
  billing?: { chargedTokens: number; balanceAfter: number; replayed?: boolean };
};

function formatMoney(value: number | null, currency: string): string {
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

function TrendIcon({ trend }: { trend: MetalQuote["trend"] }) {
  if (trend === "up") return <TrendingUp className="size-4 text-emerald-400" aria-label="Naik" />;
  if (trend === "down") return <TrendingDown className="size-4 text-red-400" aria-label="Turun" />;
  return <Minus className="size-4 text-muted" aria-label="Mendatar" />;
}

function AiSignalHero({ gold, silver }: { gold: MetalQuote | null | undefined; silver: MetalQuote | null | undefined }) {
  // Hero utama ikut Emas (fokus peniaga). Fallback ke Perak jika Emas tiada.
  const primary = gold ?? silver ?? null;
  const primaryLabel = gold ? "Emas" : "Perak";
  const signal = primary?.ai_signal ?? null;
  const reason = primary?.signal_reason ?? null;
  if (!primary || !signal) return null;

  const config = {
    BELI: {
      text: "🟢 ISYARAT AI: BELI",
      card: "border-emerald-500/50 bg-emerald-500/15 shadow-[0_0_60px_-10px_rgba(16,185,129,0.6)]",
      heading: "text-emerald-300",
    },
    JUAL: {
      text: "🔴 ISYARAT AI: JUAL",
      card: "border-red-500/50 bg-red-500/15 shadow-[0_0_60px_-10px_rgba(239,68,68,0.6)]",
      heading: "text-red-300",
    },
    SIMPAN: {
      text: "🟡 ISYARAT AI: SIMPAN",
      card: "border-yellow-400/50 bg-yellow-400/10 shadow-[0_0_60px_-12px_rgba(250,204,21,0.45)]",
      heading: "text-yellow-200",
    },
  }[signal];

  const secondary =
    gold && silver && gold.ai_signal && silver.ai_signal && gold.ai_signal !== silver.ai_signal
      ? `Emas: ${gold.ai_signal} · Perak: ${silver.ai_signal}`
      : null;

  return (
    <section
      aria-live="polite"
      aria-label={`Isyarat AI ${signal}`}
      className={cn("relative overflow-hidden rounded-2xl border p-6 text-center sm:p-8", config.card)}
    >
      <p className="text-[11px] font-semibold tracking-[0.22em] text-white/70 uppercase">
        Isyarat AI · {primaryLabel}
      </p>
      <h2 className={cn("mt-2 text-3xl font-extrabold break-words tracking-tight sm:text-4xl", config.heading)}>
        {config.text}
      </h2>
      {reason && <p className="mx-auto mt-2 max-w-xl text-sm text-white/80">{reason}</p>}
      {secondary && <p className="mt-1 text-xs font-medium text-white/60">{secondary}</p>}
      <p className="mx-auto mt-3 max-w-xl text-[11px] leading-relaxed text-white/55 italic">
        Berdasarkan analisis data pasaran hari ini. Bukan nasihat pelaburan peribadi.
      </p>
    </section>
  );
}

function QuoteCard({ title, quote }: { title: string; quote: MetalQuote | null }) {
  if (!quote) {
    return (
      <div className="panel p-6 text-center">
        <p className="text-sm text-muted">{title}: data tidak tersedia buat masa ini.</p>
      </div>
    );
  }
  const breakdown = quote.karatPrices ?? quote.finenessPrices;
  const pct = quote.changePercentage;
  return (
    <article className="panel panel-lift relative overflow-hidden p-6">
      <div className="aurora -top-16 -right-16 h-40 w-40 bg-amber-400/10" aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/25 ring-inset">
            <Coins className="size-5" />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-white">{title}</h2>
            <p className="font-mono text-[10px] tracking-widest text-muted uppercase">{quote.symbol}</p>
          </div>
        </div>
        <TrendIcon trend={quote.trend} />
      </div>

      <p className="relative mt-4 text-3xl font-semibold break-words tracking-tight text-white tabular-nums">
        {formatMoney(quote.mid, quote.currency)}
      </p>
      <p className="relative mt-1 text-[11px] text-muted">
        per auns troy ·{" "}
        <span className={cn(pct !== null && pct >= 0 ? "text-emerald-400" : "text-red-400")}>
          {pct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% hari ini`}
        </span>
      </p>

      <dl className="relative mt-4 grid grid-cols-2 gap-2 text-xs">
        {[
          ["Bid", formatMoney(quote.bid, quote.currency)],
          ["Ask", formatMoney(quote.ask, quote.currency)],
          ["Tertinggi", formatMoney(quote.high, quote.currency)],
          ["Terendah", formatMoney(quote.low, quote.currency)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <dt className="text-[10px] text-muted">{label}</dt>
            <dd className="mt-0.5 font-medium text-silver tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {breakdown && (
        <div className="relative mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          <p className="text-[10px] tracking-[0.12em] text-muted uppercase">
            {quote.karatPrices ? "Pecahan karat / auns" : "Pecahan ketulenan / auns"}
          </p>
          <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums">
            {Object.entries(breakdown).map(([key, value]) => (
              <li key={key} className="flex items-baseline justify-between gap-2">
                <span className="text-muted">{key}</span>
                <span className="text-silver">{formatMoney(value, quote.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

/**
 * Member premium metals analysis (Boss spec: "Analisis Emas & Perak",
 * 2,000 tokens per analysis).
 *
 * Metered server-side in `/api/metals`: the balance is checked BEFORE the
 * vendor call, a failed fetch is free, and only a successful analysis charges.
 * This UI therefore charges exactly one call per button press — mounting the
 * page never spends tokens.
 */
export function MemberMetals({ initialCurrency }: { initialCurrency: "MYR" | "IDR" }) {
  const [currency, setCurrency] = useState<"MYR" | "IDR">(initialCurrency);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<MetalsResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function analyze() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/metals?currency=${currency}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as MetalsResponse | null;
      if (response.status === 402 && payload && payload.code === "insufficient_tokens") {
        setNotice(
          `Baki tidak mencukupi — analisis ini memerlukan ${(payload.required ?? METALS_COST_TOKENS).toLocaleString("en-US")} token. Baki anda: ${(payload.balance ?? 0).toLocaleString("en-US")} token.`,
        );
        return;
      }
      if (!response.ok || !payload?.ok) {
        setNotice("Analisis tidak tersedia buat masa ini. Tiada token ditolak — cuba lagi sebentar.");
        return;
      }
      setData(payload);
    } catch {
      setNotice("Rangkaian bermasalah. Tiada token ditolak — cuba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="panel relative overflow-hidden p-6 sm:p-8">
        <div className="aurora -top-20 left-1/3 h-48 w-80 bg-amber-400/15" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] p-1" role="group" aria-label="Mata wang">
            {(["MYR", "IDR"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setCurrency(option)}
                aria-pressed={currency === option}
                className={cn(
                  "min-h-[44px] rounded-full px-4 text-xs font-semibold transition-colors",
                  currency === option ? "bg-brand-strong text-white" : "text-muted hover:text-white",
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={analyze}
            disabled={busy}
            className="btn-brand cta-glow inline-flex h-11 items-center gap-2 rounded-xl px-6 text-sm font-semibold disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Menganalisis…
              </>
            ) : (
              <>
                <Zap className="size-4" aria-hidden />
                Dapatkan Analisis · Tolak {METALS_COST_TOKENS.toLocaleString("en-US")} Token
              </>
            )}
          </button>
        </div>
        {notice && (
          <p role="alert" className="relative mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
            {notice}
          </p>
        )}
      </div>

      {data && (
        <>
          <div className="mt-4" aria-live="polite">
            <AiSignalHero gold={data.gold} silver={data.silver} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2" aria-live="polite">
            <QuoteCard title="Emas" quote={data.gold ?? null} />
            <QuoteCard title="Perak" quote={data.silver ?? null} />
          </div>
        </>
      )}

      {data?.billing && (
        <p className="mt-3 text-center text-[11px] text-muted/80 tabular-nums">
          {data.billing.chargedTokens > 0
            ? `${data.billing.chargedTokens.toLocaleString("en-US")} token ditolak · baki ${data.billing.balanceAfter.toLocaleString("en-US")}`
            : "Tiada token ditolak untuk analisis ini"}
        </p>
      )}
    </div>
  );
}

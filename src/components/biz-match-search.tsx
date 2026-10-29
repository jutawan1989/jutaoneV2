"use client";

import { useCallback, useState, type FormEvent } from "react";
import { Building2, ExternalLink, Loader2, MapPin, Search, ShieldCheck, Sparkles, Zap } from "lucide-react";
import {
  BIZ_SEARCH_API,
  isInsufficient,
  paywallMessage,
  readBalanceAfter,
} from "@/lib/ai-tools";
import { cn } from "@/lib/utils";

export type SupplierResult = {
  id: string;
  companyName: string;
  category: string | null;
  location: string | null;
  country: string | null;
  description: string | null;
  url: string | null;
  origin: "exa" | "directory";
  verified: boolean;
};

type Billing = {
  chargedTokens: number;
  balanceAfter: number;
  replayed?: boolean;
  freeMode?: boolean;
};

type SearchResponse = {
  ok?: boolean;
  source?: "exa" | "directory" | "none";
  count?: number;
  results?: SupplierResult[];
  degraded?: string | null;
  code?: string;
  required?: number;
  balance?: number;
  billing?: Billing;
};

const EXAMPLES = [
  "pembekal kain di Kelantan",
  "pembekal pembungkusan makanan Selangor",
  "supplier kopi borong Indonesia",
];

/**
 * Biz-Match search — premium dark "AI giant" edition.
 *
 * Results are fetched on submit rather than per keystroke: each search costs a
 * metered Exa request, and streaming results as someone types would burn quota
 * on half-typed words.
 *
 * "Save" appears only on live web results. Directory rows are already stored, so
 * offering the action there would be a no-op that looks like it did something.
 */
export function BizMatchSearch({
  categories,
  liveSearch,
}: {
  categories: string[];
  liveSearch: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SupplierResult[] | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [degraded, setDegraded] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, "saving" | "saved" | "failed">>({});
  const [billing, setBilling] = useState<Billing | null>(null);
  const [insufficient, setInsufficient] = useState<{ required: number; balance: number } | null>(
    null,
  );

  const run = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const q = query.trim();
      if (q.length < 3 || busy) return;

      setBusy(true);
      setError(null);
      setSaved({});
      setInsufficient(null);

      try {
        const response = await fetch(
          `${BIZ_SEARCH_API.url}?q=${encodeURIComponent(q)}`,
        );
        const data = (await response.json()) as SearchResponse;

        if (response.status === 402 && isInsufficient(data)) {
          // Not an error the visitor can fix by retrying, so it gets its own
          // state rather than the generic failure text.
          setInsufficient({ required: data.required, balance: data.balance });
          setResults(null);
          setBilling(null);
          return;
        }

        if (response.status === 402) {
          // Unknown 402 shape: still surface the paywall copy, never crash.
          const fallback = paywallMessage(
            typeof data.required === "number" ? data.required : BIZ_SEARCH_API.costTokens,
            typeof data.balance === "number" ? data.balance : 0,
          );
          setError(fallback);
          setResults(null);
          return;
        }

        if (!response.ok) {
          setError(
            data.code === "query_too_short"
              ? "Taip sekurang-kurangnya 3 aksara."
              : "Carian gagal. Cuba lagi.",
          );
          setResults(null);
          return;
        }

        setResults(data.results ?? []);
        setSource(data.source ?? null);
        setDegraded(data.degraded ?? null);
        const after = readBalanceAfter(data);
        setBilling(
          data.billing ?? (after !== null ? { chargedTokens: 0, balanceAfter: after } : null),
        );
      } catch {
        setError("Rangkaian bermasalah. Cuba lagi.");
      } finally {
        setBusy(false);
      }
    },
    [busy, query],
  );

  async function save(result: SupplierResult) {
    setSaved((prev) => ({ ...prev, [result.id]: "saving" }));
    try {
      const response = await fetch("/api/biz-match/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_name: result.companyName,
          category: result.category,
          location: result.location,
          country: result.country,
          website: result.url,
        }),
      });
      setSaved((prev) => ({ ...prev, [result.id]: response.ok ? "saved" : "failed" }));
    } catch {
      setSaved((prev) => ({ ...prev, [result.id]: "failed" }));
    }
  }

  const filtered = (results ?? []).filter(
    (result) => !category || result.category === category,
  );

  return (
    <div className="relative">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-b from-[#0d1b3d] via-[#0a1226] to-[#060c18] p-6 sm:p-10">
        <div className="aurora -top-24 left-1/4 h-56 w-96 bg-brand/25" aria-hidden />
        <div className="aurora top-10 -right-16 h-48 w-64 bg-emerald-500/15" aria-hidden />
        <div className="relative">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-[10px] font-semibold tracking-[0.18em] text-brand-soft uppercase">
            <Sparkles className="size-3" /> Biz-Match · Carian AI Live
          </p>
          <h2 className="mt-4 max-w-xl text-3xl leading-tight font-semibold tracking-[-0.03em] text-white sm:text-4xl">
            Cari pembekal borong dalam beberapa saat
          </h2>
          <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-muted">
            Carian semantik merentas web Malaysia &amp; Indonesia, dengan direktori
            tempatan sebagai sandaran. Data daftar rasmi ditanda{" "}
            <span className="font-medium text-emerald-300">Verified</span>.
          </p>

          {/* ── Big glowing search ── */}
          <form onSubmit={run} className="mt-6">
            <label htmlFor="bm-q" className="sr-only">
              Cari pembekal
            </label>
            <div className="group flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/40 p-2 shadow-[0_0_0_1px_rgba(59,130,246,0.15),0_0_44px_-8px_rgba(59,130,246,0.45)] transition-shadow focus-within:shadow-[0_0_0_1px_rgba(59,130,246,0.5),0_0_64px_-8px_rgba(59,130,246,0.7)] sm:flex-row">
              <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3">
                <Search className="size-5 shrink-0 text-brand-soft" aria-hidden />
                <input
                  id="bm-q"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cari pembekal borong (cth: pembekal kain di Kelantan)"
                  className="h-12 w-full bg-transparent text-[15px] text-white placeholder:text-muted/60 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={busy || query.trim().length < 3}
                className="btn-brand cta-glow inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-7 text-sm font-semibold disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Mencari…
                  </>
                ) : (
                  <>
                    <Zap className="size-4" aria-hidden /> Cari Sekarang
                  </>
                )}
              </button>
            </div>

            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              {categories.length > 0 && (
                <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1.5 pr-3 pl-3.5 text-xs text-muted">
                  Kategori
                  <select
                    id="bm-cat"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="bg-transparent text-xs font-medium text-silver focus:outline-none [&>option]:bg-slate-900"
                  >
                    <option value="">Semua</option>
                    {categories.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-200">
                <Zap className="size-3" aria-hidden />
                {BIZ_SEARCH_API.costTokens.toLocaleString("en-US")} Token ditolak hanya jika carian berjaya
              </span>
            </div>

            {!results && (
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setQuery(example)}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-silver transition-colors hover:border-brand/50 hover:text-white"
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <p role="alert" className="mt-3 text-sm text-red-300">
                {error}
              </p>
            )}

            {insufficient && (
              <div role="alert" className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm font-medium text-amber-200">Token tidak mencukupi</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                  Carian ini memerlukan {insufficient.required.toLocaleString("en-US")} token.
                  Baki anda: {insufficient.balance.toLocaleString("en-US")} token. Top-up untuk sambung.
                </p>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* ── Results ── */}
      {results && (
        <section aria-live="polite" className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-silver">
              <span className="font-semibold text-white tabular-nums">{filtered.length}</span>{" "}
              <span className="text-muted">pembekal</span>
              <span className="text-muted">
                {source === "exa" ? " daripada carian web AI" : " daripada direktori"}
              </span>
            </p>
            {!liveSearch && (
              <p className="text-[11px] text-amber-300/80">Carian web tidak dikonfigurasi</p>
            )}
            {degraded && source === "directory" && (
              <p className="text-[11px] text-amber-300/80">
                Carian web tidak tersedia — memaparkan direktori
              </p>
            )}
            {billing && (
              <p className="text-[11px] text-muted/80 tabular-nums">
                {billing.chargedTokens > 0
                  ? `${billing.chargedTokens.toLocaleString("en-US")} token ditolak · baki ${billing.balanceAfter.toLocaleString("en-US")}`
                  : "Tiada token ditolak untuk carian ini"}
                {billing.replayed ? " · sudah dicaj sebelum ini" : ""}
              </p>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="panel mt-4 p-8 text-center">
              <Building2 className="mx-auto size-8 text-muted" aria-hidden />
              <p className="mt-3 text-sm text-silver">
                Tiada pembekal sepadan. Cuba kata kunci lain, atau nama tempat.
              </p>
            </div>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {filtered.map((result) => {
                const state = saved[result.id];
                return (
                  <li
                    key={result.id}
                    className="panel panel-lift group relative flex flex-col p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 flex-1 text-[15px] font-semibold break-words text-white">
                        {result.companyName}
                      </h2>
                      {result.verified ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-300 uppercase">
                          <ShieldCheck className="size-3" aria-hidden /> Verified
                        </span>
                      ) : result.origin === "exa" ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-brand-soft uppercase">
                          <Sparkles className="size-3" aria-hidden /> AI Web
                        </span>
                      ) : null}
                    </div>

                    {result.description && (
                      <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted">
                        {result.description}
                      </p>
                    )}

                    <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted/90">
                      {result.category && (
                        <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5">{result.category}</span>
                      )}
                      {(result.location || result.country) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" aria-hidden />
                          {[result.location, result.country].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </p>

                    <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-3.5">
                      {result.url && (
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className={cn(
                            "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-colors",
                            "border border-brand/40 bg-brand/10 text-brand-soft hover:bg-brand/20 hover:text-white",
                          )}
                        >
                          <ExternalLink className="size-3.5" aria-hidden /> Lawati
                        </a>
                      )}
                      {result.origin === "exa" && (
                        <button
                          type="button"
                          onClick={() => save(result)}
                          disabled={state === "saving" || state === "saved"}
                          className={cn(
                            "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-60",
                            state === "saved"
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                              : "border-white/10 bg-white/[0.03] text-silver hover:border-white/25 hover:text-white",
                          )}
                        >
                          {state === "saved"
                            ? "Tersimpan ✓"
                            : state === "saving"
                              ? "Menyimpan…"
                              : state === "failed"
                                ? "Gagal — cuba lagi"
                                : "Simpan ke Direktori"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

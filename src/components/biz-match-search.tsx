"use client";

import { useCallback, useState, type FormEvent } from "react";

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

type SearchResponse = {
  ok?: boolean;
  source?: "exa" | "directory" | "none";
  count?: number;
  results?: SupplierResult[];
  degraded?: string | null;
  code?: string;
};

const EXAMPLES = [
  "pembekal kain di Kelantan",
  "pembekal pembungkusan makanan Selangor",
  "supplier kopi borong Indonesia",
];

/**
 * Biz-Match search.
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

  const run = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const q = query.trim();
      if (q.length < 3 || busy) return;

      setBusy(true);
      setError(null);
      setSaved({});

      try {
        const response = await fetch(`/api/biz-match/search?q=${encodeURIComponent(q)}`);
        const data = (await response.json()) as SearchResponse;

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
    <>
      <form onSubmit={run} className="mt-6">
        <label htmlFor="bm-q" className="sr-only">
          Cari pembekal
        </label>
        <div className="flex gap-2">
          <input
            id="bm-q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari pembekal borong (cth: pembekal kain di Kelantan)"
            className="w-full rounded-lg border border-line bg-ink-2/70 px-3.5 py-2.5 text-sm text-white placeholder:text-muted/70 focus:border-brand focus:outline-none"
          />
          <button type="submit" disabled={busy || query.trim().length < 3} className="btn-brand px-4">
            {busy ? "Mencari…" : "Cari"}
          </button>
        </div>

        {categories.length > 0 && (
          <div className="mt-2.5 flex items-center gap-2 text-xs text-muted">
            <label htmlFor="bm-cat">Kategori</label>
            <select
              id="bm-cat"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-md border border-line bg-ink-2/70 px-2 py-1.5 text-xs text-silver focus:border-brand focus:outline-none"
            >
              <option value="">Semua</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        )}

        {!results && (
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQuery(example)}
                className="rounded-md border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-[#334155] hover:text-white"
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
      </form>

      {results && (
        <section aria-live="polite" className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs text-muted">
              {filtered.length} pembekal
              {source === "exa" ? " daripada carian web" : " daripada direktori"}
            </p>
            {!liveSearch && (
              <p className="text-[11px] text-amber-300/80">Carian web tidak dikonfigurasi</p>
            )}
            {degraded && source === "directory" && (
              <p className="text-[11px] text-amber-300/80">
                Carian web tidak tersedia — memaparkan direktori
              </p>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="card mt-3 p-6 text-center">
              <p className="text-sm text-muted">
                Tiada pembekal sepadan. Cuba kata kunci lain, atau nama tempat.
              </p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {filtered.map((result) => {
                const state = saved[result.id];
                return (
                  <li key={result.id} className="card p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-semibold text-white">
                            {result.companyName}
                          </h2>
                          {result.verified && (
                            <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-emerald-300 uppercase">
                              <span aria-hidden>✅</span> Verified
                            </span>
                          )}
                          {result.origin === "exa" && !result.verified && (
                            <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted uppercase">
                              Web
                            </span>
                          )}
                        </div>

                        {result.description && (
                          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">
                            {result.description}
                          </p>
                        )}

                        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted/80">
                          {result.category && <span>{result.category}</span>}
                          {result.location && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{result.location}</span>
                            </>
                          )}
                          {result.country && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{result.country}</span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {result.url && (
                          <a
                            href={result.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-silver transition-colors hover:border-[#334155] hover:text-white"
                          >
                            Lawati
                          </a>
                        )}
                        {result.origin === "exa" && (
                          <button
                            type="button"
                            onClick={() => save(result)}
                            disabled={state === "saving" || state === "saved"}
                            className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-silver transition-colors hover:border-brand/50 hover:text-white disabled:opacity-60"
                          >
                            {state === "saved"
                              ? "Tersimpan"
                              : state === "saving"
                                ? "Menyimpan…"
                                : state === "failed"
                                  ? "Gagal — cuba lagi"
                                  : "Save to Database"}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

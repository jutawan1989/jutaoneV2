"use client";

import { useCallback, useMemo, useState } from "react";
import type { DirectorySupplier } from "@/app/directory/page";

const COUNTRIES = [
  { code: "", label: "Semua negara" },
  { code: "MY", label: "Malaysia" },
  { code: "ID", label: "Indonesia" },
];

function contactHref(info: Record<string, string>): string | null {
  if (info.email) return `mailto:${info.email}`;
  if (info.phone) return `tel:${info.phone.replace(/[^\d+]/g, "")}`;
  return null;
}

/**
 * Search is client-side over the server-rendered set.
 *
 * The page already delivers up to 30 matching rows in the first paint, so
 * filtering them in the browser is instant and costs no request per keystroke.
 * A larger dataset would move this back to the server; at this size a network
 * round trip per character is the slower and worse option.
 */
export function DirectorySearch({
  initialResults,
  initialQuery,
  initialCategory,
  initialCountry,
  categories,
  total,
}: {
  initialResults: DirectorySupplier[];
  initialQuery: string;
  initialCategory: string;
  initialCountry: string;
  categories: string[];
  total: number;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [country, setCountry] = useState(initialCountry);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialResults.filter((supplier) => {
      if (category && supplier.category !== category) return false;
      if (country && supplier.country !== country) return false;
      if (!q) return true;
      return (
        supplier.company_name.toLowerCase().includes(q) ||
        (supplier.category ?? "").toLowerCase().includes(q) ||
        (supplier.location ?? "").toLowerCase().includes(q)
      );
    });
  }, [initialResults, query, category, country]);

  const reset = useCallback(() => {
    setQuery("");
    setCategory("");
    setCountry("");
  }, []);

  const filtered = query !== "" || category !== "" || country !== "";

  return (
    <>
      <section aria-label="Carian" className="mt-6">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <label htmlFor="dir-q" className="sr-only">
              Cari pembekal
            </label>
            <input
              id="dir-q"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama syarikat, kategori atau lokasi…"
              className="w-full rounded-lg border border-line bg-ink-2/70 px-3.5 py-2.5 text-sm text-white placeholder:text-muted/70 focus:border-brand focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="dir-category" className="sr-only">
              Kategori
            </label>
            <select
              id="dir-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-lg border border-line bg-ink-2/70 px-3 py-2.5 text-sm text-silver focus:border-brand focus:outline-none"
            >
              <option value="">Semua kategori</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="dir-country" className="sr-only">
              Negara
            </label>
            <select
              id="dir-country"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              className="w-full rounded-lg border border-line bg-ink-2/70 px-3 py-2.5 text-sm text-silver focus:border-brand focus:outline-none"
            >
              {COUNTRIES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs text-muted">
          <span aria-live="polite" className="tabular-nums">
            {results.length} daripada {total} pembekal
          </span>
          {filtered && (
            <button type="button" onClick={reset} className="hover:text-white">
              Set semula
            </button>
          )}
        </div>
      </section>

      <section aria-label="Hasil" className="mt-5">
        {results.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-muted">
              Tiada pembekal sepadan. Cuba kata kunci yang lebih umum.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {results.map((supplier) => {
              const contact = contactHref(supplier.contact_info);
              return (
                <li key={supplier.id} className="card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-white">
                          {supplier.company_name}
                        </h2>
                        {supplier.verified && (
                          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-emerald-300 uppercase">
                            <span aria-hidden>✅</span> Verified
                          </span>
                        )}
                      </div>

                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        {supplier.category && <span>{supplier.category}</span>}
                        {supplier.location && (
                          <>
                            <span aria-hidden>·</span>
                            <span>{supplier.location}</span>
                          </>
                        )}
                        <span aria-hidden>·</span>
                        <span>{supplier.country === "ID" ? "Indonesia" : "Malaysia"}</span>
                      </p>

                      {supplier.contact_info.email && (
                        <p className="mt-1.5 text-xs text-muted/80">
                          {supplier.contact_info.email}
                        </p>
                      )}
                    </div>

                    {contact && (
                      <a
                        href={contact}
                        className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-silver transition-colors hover:border-[#334155] hover:text-white"
                      >
                        Hubungi
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

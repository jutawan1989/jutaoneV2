"use client";

import { useCallback, useState, type FormEvent } from "react";
import type { Locale, Region } from "@/lib/i18n/config";

const MAX_CHARS = 200;
const MIN_CHARS = 5;

type Result = {
  caption?: string;
  source?: string;
  model?: string;
  latencyMs?: number;
  costUsd?: number;
  code?: string;
  reason?: string;
};

type Entry = {
  id: number;
  text: string;
  caption: string;
  source: string;
  model: string;
  latencyMs: number;
};

const LOCALES: Locale[] = ["ms", "id", "en"];
const REGIONS: Region[] = ["MY", "ID", "OTHER"];

export function PlaygroundClient({ errorText }: { errorText: string | null }) {
  const [text, setText] = useState("");
  const [locale, setLocale] = useState<Locale>("ms");
  const [region, setRegion] = useState<Region>("MY");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(errorText);
  const [totalCost, setTotalCost] = useState(0);
  const [runs, setRuns] = useState(0);

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (busy) return;

      const value = text.trim();
      if (value.length < MIN_CHARS) {
        setError(`Needs at least ${MIN_CHARS} characters.`);
        return;
      }

      setBusy(true);
      setError(null);

      try {
        const response = await fetch("/api/admin/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: value, locale, region }),
        });
        const data = (await response.json()) as Result;

        if (response.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        if (response.status === 503) {
          setError(`AI is paused: ${data.reason ?? data.code ?? "unavailable"}`);
          return;
        }
        if (!response.ok || !data.caption) {
          setError(data.code ?? "Generation failed.");
          return;
        }

        setEntries((prev) => [
          {
            id: Date.now(),
            text: value,
            caption: data.caption!,
            source: data.source ?? "?",
            model: data.model ?? "?",
            latencyMs: data.latencyMs ?? 0,
          },
          ...prev,
        ]);
        setRuns((n) => n + 1);
        setTotalCost((c) => c + (data.costUsd ?? 0));
      } catch {
        setError("Network error.");
      } finally {
        setBusy(false);
      }
    },
    [busy, locale, region, text],
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-5">
        <div>
          <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
            Internal · not indexed
          </p>
          <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-white">
            Boss Playground
          </h1>
          <p className="mt-1 text-sm text-muted">
            Unlimited generation. No visitor limit, no public analytics.
          </p>
        </div>
        <dl className="flex gap-6 text-right text-xs text-muted">
          <div>
            <dt className="tracking-[0.1em] uppercase">Runs</dt>
            <dd className="mt-1 text-base font-semibold text-white tabular-nums">{runs}</dd>
          </div>
          <div>
            <dt className="tracking-[0.1em] uppercase">Spend</dt>
            <dd className="mt-1 text-base font-semibold text-white tabular-nums">
              ${totalCost.toFixed(4)}
            </dd>
          </div>
        </dl>
      </header>

      <form onSubmit={submit} className="mt-6">
        <label htmlFor="pg-text" className="block text-sm font-medium text-white">
          What the merchant sells
        </label>
        <textarea
          id="pg-text"
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, MAX_CHARS))}
          rows={3}
          maxLength={MAX_CHARS}
          placeholder="Kek lapis Sarawak homemade, RM45 sekotak, pos seluruh Malaysia"
          className="mt-2 w-full resize-none rounded-lg border border-line bg-ink-2/70 px-3.5 py-3 text-sm text-white transition-colors placeholder:text-muted/70 focus:border-brand focus:outline-none"
        />
        <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
          <span>Enter to generate · Shift+Enter for a new line</span>
          <span className="tabular-nums">
            {text.length}/{MAX_CHARS}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy || text.trim().length < MIN_CHARS} className="btn-brand">
            {busy ? "Generating…" : "Generate"}
          </button>

          <div className="flex items-center gap-2 text-xs text-muted">
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
              aria-label="Locale"
              className="rounded-md border border-line bg-ink-2/70 px-2 py-1.5 text-xs text-silver focus:border-brand focus:outline-none"
            >
              {LOCALES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={region}
              onChange={(event) => setRegion(event.target.value as Region)}
              aria-label="Region"
              className="rounded-md border border-line bg-ink-2/70 px-2 py-1.5 text-xs text-silver focus:border-brand focus:outline-none"
            >
              {REGIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        )}
      </form>

      <section aria-live="polite" className="mt-8 space-y-3">
        {entries.length === 0 ? (
          <p className="card p-5 text-sm text-muted">
            No runs yet. Generated captions appear here, newest first.
          </p>
        ) : (
          entries.map((entry) => (
            <article key={entry.id} className="card p-5">
              <div className="flex items-center justify-between border-b border-line pb-2.5 text-[11px] text-muted">
                <span className="font-medium tracking-[0.1em] uppercase">
                  {entry.source} · {entry.model}
                </span>
                <span className="tabular-nums">{entry.latencyMs} ms</span>
              </div>
              <p className="mt-3 text-xs text-muted/80">{entry.text}</p>
              <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-silver">
                {entry.caption}
              </p>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(entry.caption)}
                className="mt-3 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-silver transition-colors hover:border-[#334155] hover:text-white"
              >
                Copy
              </button>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

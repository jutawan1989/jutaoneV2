"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { captureUtm } from "@/lib/analytics/client";
import type { Dictionary } from "@/lib/i18n";
import { format, type Locale } from "@/lib/i18n/config";
import type { Variant } from "@/lib/analytics/variant";
import { HookModal } from "@/components/hook-modal";

const MAX_CHARS = 200;
const MIN_CHARS = 5;

type DemoResponse = {
  caption?: string;
  source?: string;
  latencyMs?: number;
  remaining?: number | null;
  used?: number | null;
  max?: number | null;
  copyAllowed?: boolean;
  variant?: Variant;
  code?: string;
};

type AdGeneratorProps = {
  locale: Locale;
  dict: Dictionary;
  variant: Variant;
  priceDisplay: string;
  currency: string;
  tokenName: string;
  initialRemaining: number;
  initialUsed: number;
  maxAttempts: number;
  /** Whether this generation's output may be copied; server-decided. */
  initialCopyAllowed: boolean;
  demoDisabled: boolean;
};

export function AdGenerator({
  locale,
  dict,
  variant,
  priceDisplay,
  currency,
  tokenName,
  initialRemaining,
  initialUsed,
  maxAttempts,
  initialCopyAllowed,
  demoDisabled,
}: AdGeneratorProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [used, setUsed] = useState(initialUsed);
  const [error, setError] = useState<string | null>(null);
  const [hookOpen, setHookOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Whether the current caption may be copied. Server-decided: the lock is a
  // paid feature, so the client must not be able to unlock it by editing state.
  const [copyAllowed, setCopyAllowed] = useState(initialCopyAllowed);
  const [lockNotice, setLockNotice] = useState<string | null>(null);
  const hookTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    captureUtm();
    return () => {
      if (hookTimer.current) clearTimeout(hookTimer.current);
    };
  }, []);

  const openHook = useCallback(() => setHookOpen(true), []);

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (loading || demoDisabled) return;

      const value = text.trim();
      if (value.length < MIN_CHARS) {
        setError(dict.generator.errorTooShort);
        return;
      }

      setLoading(true);
      setError(null);
      setCopied(false);

      try {
        const response = await fetch("/api/demo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: value, locale }),
        });
        const data = (await response.json()) as DemoResponse;

        if (response.ok && data.caption) {
          setCaption(data.caption);
          if (typeof data.copyAllowed === "boolean") setCopyAllowed(data.copyAllowed);
          setLockNotice(null);
          const nextRemaining = data.remaining ?? 0;
          setRemaining(nextRemaining);
          if (typeof data.used === "number") setUsed(data.used);
          if (nextRemaining <= 0) {
            hookTimer.current = setTimeout(openHook, 1400);
          }
          return;
        }

        if (response.status === 429) {
          setRemaining(0);
          setCopyAllowed(false);
          // The quota is spent, so the hook leads with the $1 top-up rather than
          // a bare error.
          setLockNotice(dict.generator.quotaExhausted);
          setError(dict.generator.errorLimit);
          openHook();
          return;
        }
        if (response.status === 503) {
          setRemaining(0);
          setError(dict.generator.errorBlocked);
          return;
        }
        if (data.code === "text_too_short") {
          setError(dict.generator.errorTooShort);
          return;
        }
        setError(dict.generator.errorGeneric);
      } catch {
        setError(dict.generator.errorGeneric);
      } finally {
        setLoading(false);
      }
    },
    [demoDisabled, dict, loading, locale, openHook, text],
  );

  async function copyCaption() {
    if (!caption) return;

    // Locked: show the hook instead of copying. The visitor keeps seeing the
    // text; paying is what unlocks using it.
    if (!copyAllowed) {
      setLockNotice(dict.generator.copyLocked);
      openHook();
      return;
    }

    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const exhausted = remaining <= 0 && !demoDisabled;
  const submitDisabled = loading || demoDisabled || exhausted || text.trim().length < MIN_CHARS;

  return (
    <section id="demo" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900 sm:text-3xl">
            {dict.generator.title}
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-600">
            {dict.generator.subtitle}
          </p>

          <form onSubmit={submit} className="mt-7">
            <label htmlFor="product" className="block text-sm font-medium text-slate-900">
              {dict.generator.label}
            </label>
            <textarea
              id="product"
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, MAX_CHARS))}
              placeholder={dict.generator.placeholder}
              maxLength={MAX_CHARS}
              rows={4}
              disabled={demoDisabled}
              aria-describedby="product-hint"
              className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-brand focus:outline-none disabled:opacity-60"
            />
            <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
              <span id="product-hint">{dict.generator.hint}</span>
              <span aria-live="polite" className="tabular-nums">
                {text.length}/{MAX_CHARS}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={submitDisabled} className="btn-brand">
                {loading ? dict.generator.generating : dict.generator.submit}
              </button>

              {demoDisabled ? (
                <span className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
                  {dict.generator.errorBlocked}
                </span>
              ) : (
                <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500 tabular-nums">
                  {format(remaining === 1 ? dict.generator.remaining : dict.generator.remainingPlural, {
                    // The copy now reads "Kuota Harian: X/5", so it needs both
                    // values; passing only `count` left the placeholders raw.
                    remaining: Math.max(remaining, 0),
                    max: maxAttempts,
                    count: Math.max(remaining, 0),
                  })}
                </span>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {error}
              </p>
            )}
          </form>
        </div>

        <div className="flex min-h-[18rem] flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <p className="text-[11px] font-medium tracking-[0.1em] text-slate-500 uppercase">
              {dict.generator.outputLabel}
            </p>
            {caption && (
              <button
                type="button"
                onClick={copyCaption}
                aria-disabled={!copyAllowed}
                title={copyAllowed ? undefined : dict.generator.copyLocked}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  copyAllowed
                    ? "border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900"
                    : "border-amber-300 bg-amber-50 text-amber-700"
                }`}
              >
                {copied
                  ? dict.generator.copied
                  : copyAllowed
                    ? dict.generator.copy
                    : `🔒 ${dict.generator.copy}`}
              </button>
            )}
          </div>

          {caption ? (
            <p
              aria-live="polite"
              className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700"
            >
              {caption}
            </p>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="max-w-xs text-center text-sm text-slate-400">{dict.generator.placeholder}</p>
            </div>
          )}

          {lockNotice && (
            <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
              {lockNotice}
            </p>
          )}

          <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
            <span className="tabular-nums">
              {format(dict.generator.limitBadge, {
                count: Math.min(used, maxAttempts),
                max: maxAttempts,
              })}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-medium text-slate-600">
              {dict.pricing.tokenName}
            </span>
          </div>
        </div>
      </div>

      <HookModal
        open={hookOpen}
        locale={locale}
        variant={variant}
        dict={dict}
        priceDisplay={priceDisplay}
        currency={currency}
        tokenName={tokenName}
        onClose={() => setHookOpen(false)}
      />
    </section>
  );
}

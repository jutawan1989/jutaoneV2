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
    <section id="demo" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div>
          <h2 className="text-2xl font-extrabold text-white sm:text-3xl">{dict.generator.title}</h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">{dict.generator.subtitle}</p>

          <form onSubmit={submit} className="mt-6">
            <label htmlFor="product" className="block text-sm font-semibold text-white">
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
              className="mt-2 w-full resize-none rounded-xl border border-line bg-ink-2/80 px-4 py-3 text-sm text-white placeholder:text-muted/70 focus:border-brand/60 focus:outline-none disabled:opacity-60"
            />
            <div className="mt-1 flex items-center justify-between text-xs text-muted">
              <span id="product-hint">{dict.generator.hint}</span>
              <span aria-live="polite">
                {text.length}/{MAX_CHARS}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={submitDisabled} className="btn-brand">
                {loading ? dict.generator.generating : dict.generator.submit}
              </button>

              {demoDisabled ? (
                <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300">
                  {dict.generator.errorBlocked}
                </span>
              ) : (
                <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">
                  {format(remaining === 1 ? dict.generator.remaining : dict.generator.remainingPlural, {
                    count: Math.max(remaining, 0),
                  })}
                </span>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-3 text-sm text-red-300">
                {error}
              </p>
            )}
          </form>
        </div>

        <div className="card flex min-h-[18rem] flex-col p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              {dict.generator.outputLabel}
            </p>
            {caption && (
              <button
                type="button"
                onClick={copyCaption}
                className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-silver transition-colors hover:border-brand/50 hover:text-white"
              >
                {copied ? dict.generator.copied : dict.generator.copy}
              </button>
            )}
          </div>

          {caption ? (
            <p
              aria-live="polite"
              className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-silver"
            >
              {caption}
            </p>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="max-w-xs text-center text-sm text-muted/70">{dict.generator.placeholder}</p>
            </div>
          )}

          <div className="mt-auto flex items-center justify-between border-t border-line/70 pt-3 text-[11px] text-muted">
            <span>
              {format(dict.generator.limitBadge, {
                count: Math.min(used, maxAttempts),
                max: maxAttempts,
              })}
            </span>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-brand-soft">
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

"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AtSign, Briefcase, Camera, Music2, Send, ThumbsUp } from "lucide-react";
import { captureUtm } from "@/lib/analytics/client";
import type { Dictionary } from "@/lib/i18n";
import { format, type Locale } from "@/lib/i18n/config";
import type { Variant } from "@/lib/analytics/variant";
import { withWatermarkChoice } from "@/lib/ai/watermark";
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
  // Viral-loop toggle (Boss + Linda spec): checked by default. Unchecking
  // strips the JutaOne.Biz watermark before copy.
  const [includeWatermark, setIncludeWatermark] = useState(true);
  // Whether the current caption may be copied. Server-decided: the lock is a
  // paid feature, so the client must not be able to unlock it by editing state.
  const [copyAllowed, setCopyAllowed] = useState(initialCopyAllowed);
  const [lockNotice, setLockNotice] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
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
      setShareNotice(null);

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

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Clipboard API can fail (non-secure context / denied permission).
      // Fallback to a hidden textarea + execCommand so the flow still works.
      try {
        const area = document.createElement("textarea");
        area.value = value;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(area);
        return ok;
      } catch {
        return false;
      }
    }
  }

  function shareText(): string {
    if (!caption) return "";
    return withWatermarkChoice(caption, locale, includeWatermark);
  }

  async function copyCaption() {
    if (!caption) return;

    // Locked: show the hook instead of copying. The visitor keeps seeing the
    // text; paying is what unlocks using it.
    if (!copyAllowed) {
      setLockNotice(dict.generator.copyLocked);
      openHook();
      return;
    }

    const ok = await copyText(shareText());
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }

  // Safe "Auto-Post" (Boss spec): no API integration. Copy the caption via
  // clipboard, then open the platform upload page in a new tab.
  type ShareTarget = "tiktok" | "facebook" | "instagram" | "threads" | "twitter" | "linkedin";

  const SHARE_URLS: Record<ShareTarget, string> = {
    tiktok: "https://www.tiktok.com/upload",
    facebook: "https://www.facebook.com/",
    instagram: "https://www.instagram.com/",
    threads: "https://www.threads.net/",
    twitter: "https://twitter.com/compose/tweet",
    linkedin: "https://www.linkedin.com/feed/?shareActive=true",
  };

  const SHARE_NAMES: Record<ShareTarget, string> = {
    tiktok: "TikTok",
    facebook: "Facebook",
    instagram: "Instagram",
    threads: "Threads",
    twitter: "X (Twitter)",
    linkedin: "LinkedIn",
  };

  async function shareTo(target: ShareTarget) {
    if (!caption) return;

    // Same paid lock as copy: locked visitors get the top-up hook instead.
    if (!copyAllowed) {
      setLockNotice(dict.generator.copyLocked);
      openHook();
      return;
    }

    // Copy FIRST, open the tab AFTER (300ms delay). Browsers may block
    // clipboard writes issued synchronously with window.open, and Facebook /
    // LinkedIn forbid pre-filled text via share URLs — so the user pastes
    // manually (Ctrl+V) on the platform.
    const ok = await copyText(shareText());
    if (!ok) {
      setShareNotice(dict.generator.shareFailed);
      return;
    }

    setShareNotice(format(dict.generator.sharedTo, { platform: SHARE_NAMES[target] }));
    const url = SHARE_URLS[target];
    setTimeout(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    }, 300);
  }

  const exhausted = remaining <= 0 && !demoDisabled;
  const submitDisabled = loading || demoDisabled || exhausted || text.trim().length < MIN_CHARS;

  return (
    <section id="demo" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-12 sm:px-6 sm:py-20">
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
              <button
                type="submit"
                disabled={submitDisabled}
                aria-busy={loading}
                className="btn-brand btn-glow cta-glow min-h-[52px] px-6 text-[15px] font-bold"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <svg
                      aria-hidden
                      width="15"
                      height="15"
                      viewBox="0 0 16 16"
                      fill="none"
                      className="ai-spinner"
                    >
                      <path
                        d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <circle cx="8" cy="8" r="2" fill="currentColor" opacity="0.7" />
                    </svg>
                    <span>{dict.generator.generating}</span>
                    <span aria-hidden className="ai-dots">
                      <span />
                      <span />
                      <span />
                    </span>
                  </span>
                ) : (
                  dict.generator.submit
                )}
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
              {withWatermarkChoice(caption, locale, includeWatermark)}
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

          {caption && (
            <div className="mt-4 space-y-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 select-none">
                <input
                  type="checkbox"
                  checked={includeWatermark}
                  onChange={(event) => setIncludeWatermark(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 accent-slate-900"
                />
                <span className="font-medium">✨ {dict.generator.includeLink}</span>
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => shareTo("tiktok")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
                >
                  <Music2 className="size-3.5" aria-hidden />
                  {dict.generator.postTiktok}
                </button>
                <button
                  type="button"
                  onClick={() => shareTo("facebook")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
                >
                  <ThumbsUp className="size-3.5" aria-hidden />
                  {dict.generator.postFacebook}
                </button>
                <button
                  type="button"
                  onClick={() => shareTo("instagram")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
                >
                  <Camera className="size-3.5" aria-hidden />
                  {dict.generator.postInstagram}
                </button>
                <button
                  type="button"
                  onClick={() => shareTo("threads")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
                >
                  <AtSign className="size-3.5" aria-hidden />
                  {dict.generator.postThreads}
                </button>
                <button
                  type="button"
                  onClick={() => shareTo("twitter")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
                >
                  <Send className="size-3.5" aria-hidden />
                  {dict.generator.postTwitter}
                </button>
                <button
                  type="button"
                  onClick={() => shareTo("linkedin")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
                >
                  <Briefcase className="size-3.5" aria-hidden />
                  {dict.generator.postLinkedin}
                </button>
              </div>
            </div>
          )}

          {shareNotice && (
            <p role="status" className="mt-3 text-xs leading-relaxed text-slate-600">
              {shareNotice}
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

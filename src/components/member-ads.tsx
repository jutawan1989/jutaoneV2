"use client";

import { useState, type FormEvent } from "react";
import {
  AtSign,
  Briefcase,
  Camera,
  Check,
  Copy,
  Loader2,
  Music2,
  Send,
  Sparkles,
  ThumbsUp,
  Zap,
} from "lucide-react";
import { AD_API, isInsufficient, paywallMessage } from "@/lib/ai-tools";
import { cn } from "@/lib/utils";

const MIN_CHARS = 5;
const MAX_CHARS = 200;

type AdsLocale = "ms" | "id" | "en";

const LOCALES: Array<{ id: AdsLocale; label: string }> = [
  { id: "ms", label: "BM" },
  { id: "id", label: "ID" },
  { id: "en", label: "EN" },
];

type AdsResponse = {
  ok?: boolean;
  caption?: string;
  source?: string;
  latencyMs?: number;
  code?: string;
  required?: number;
  balance?: number;
  billing?: { chargedTokens: number; balanceAfter: number; replayed?: boolean };
};

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

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
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

/**
 * Paid ad generator for members (Boss spec: `/dashboard/ads`, 20,000 tokens
 * per generation).
 *
 * Members never see the public `/#demo` trial: this UI talks only to the
 * metered `POST /api/ads/generate` route, which charges the member's own
 * token ledger and only on a successful caption. Mounting the page never
 * spends tokens — only the "Jana Iklan" button fires the metered call.
 */
export function MemberAds() {
  const [locale, setLocale] = useState<AdsLocale>("ms");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [billing, setBilling] = useState<AdsResponse["billing"] | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const value = text.trim();
    if (value.length < MIN_CHARS) {
      setNotice(`Tulis sekurang-kurangnya ${MIN_CHARS} aksara tentang produk anda.`);
      return;
    }
    setBusy(true);
    setNotice(null);
    setShareNotice(null);
    setCopied(false);
    try {
      const rid =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `ads-${Date.now()}`;
      const response = await fetch(AD_API.url, {
        method: AD_API.method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: value, locale, rid }),
      });
      const payload = (await response.json().catch(() => null)) as AdsResponse | null;
      if (response.status === 402 && payload && isInsufficient(payload)) {
        setNotice(paywallMessage(payload.required, payload.balance));
        setBilling(null);
        return;
      }
      if (!response.ok || !payload?.caption) {
        setNotice(
          payload?.code === "text_too_short"
            ? `Tulis sekurang-kurangnya ${MIN_CHARS} aksara tentang produk anda.`
            : "Penjanaan gagal buat masa ini. Tiada token ditolak — cuba lagi sebentar.",
        );
        return;
      }
      setCaption(payload.caption);
      setBilling(payload.billing ?? null);
    } catch {
      setNotice("Rangkaian bermasalah. Tiada token ditolak — cuba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCaption() {
    if (!caption) return;
    const ok = await copyText(caption);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2000);
    else setShareNotice("Pelayar menyekat papan keratan — salin teks di atas secara manual.");
  }

  async function shareTo(target: ShareTarget) {
    if (!caption) return;
    const ok = await copyText(caption);
    if (!ok) {
      setShareNotice("Pelayar menyekat papan keratan — salin teks di atas secara manual.");
      return;
    }
    setShareNotice(`Kapsyen disalin — tampal (Ctrl+V) di ${SHARE_NAMES[target]}.`);
    window.setTimeout(() => {
      window.open(SHARE_URLS[target], "_blank", "noopener,noreferrer");
    }, 300);
  }

  const tooShort = text.trim().length < MIN_CHARS;

  return (
    <div>
      <form onSubmit={generate} className="panel relative overflow-hidden p-6 sm:p-8">
        <div className="aurora -top-20 left-1/3 h-48 w-80 bg-brand/15" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] p-1"
            role="group"
            aria-label="Bahasa kapsyen"
          >
            {LOCALES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setLocale(entry.id)}
                aria-pressed={locale === entry.id}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                  locale === entry.id ? "bg-brand-strong text-white" : "text-muted hover:text-white",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted tabular-nums">
            {text.length}/{MAX_CHARS} aksara
          </p>
        </div>

        <label
          htmlFor="member-ads-text"
          className="relative mt-5 block text-sm font-medium text-white"
        >
          Cerita tentang produk anda dalam satu dua ayat
        </label>
        <textarea
          id="member-ads-text"
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, MAX_CHARS))}
          placeholder="Cth: Sambal bilis garing ibu, RM25 sebalang, rangup sampai ke dasar."
          maxLength={MAX_CHARS}
          rows={5}
          aria-describedby="member-ads-hint"
          className="relative mt-2 w-full resize-y rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white shadow-sm transition-colors placeholder:text-muted/60 focus:border-brand/60 focus:outline-none"
        />
        <p id="member-ads-hint" className="relative mt-1.5 text-[11px] text-muted">
          Minimum {MIN_CHARS} aksara · maksimum {MAX_CHARS} aksara. Lagi jelas ayat anda, lagi
          padu kapsyen yang keluar.
        </p>

        <button
          type="submit"
          disabled={busy || tooShort}
          aria-busy={busy}
          className="btn-brand cta-glow relative mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold disabled:opacity-60 sm:w-auto"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Menjana iklan…
            </>
          ) : (
            <>
              <Zap className="size-4" aria-hidden />
              Jana Iklan · Tolak {AD_API.costTokens.toLocaleString("en-US")} Token
            </>
          )}
        </button>

        {notice && (
          <p
            role="alert"
            className="relative mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200"
          >
            {notice}
          </p>
        )}
      </form>

      {caption && (
        <section aria-live="polite" className="panel relative mt-4 overflow-hidden p-6 sm:p-8">
          <div className="relative flex items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
            <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
              <Sparkles className="size-3.5 text-brand" aria-hidden /> Hasil kapsyen
            </p>
            <button
              type="button"
              onClick={copyCaption}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
                copied
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-white/10 bg-white/[0.03] text-silver hover:border-white/25 hover:text-white",
              )}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Disalin!" : "Salin"}
            </button>
          </div>

          <p className="relative mt-4 whitespace-pre-wrap text-sm leading-relaxed text-white">
            {caption}
          </p>

          <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(
              [
                ["tiktok", Music2, "TikTok"],
                ["facebook", ThumbsUp, "Facebook"],
                ["instagram", Camera, "Instagram"],
                ["threads", AtSign, "Threads"],
                ["twitter", Send, "X (Twitter)"],
                ["linkedin", Briefcase, "LinkedIn"],
              ] as Array<[ShareTarget, typeof Music2, string]>
            ).map(([target, Icon, label]) => (
              <button
                key={target}
                type="button"
                onClick={() => shareTo(target)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs font-medium text-silver transition-colors hover:border-white/25 hover:text-white"
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>

          {shareNotice && (
            <p role="status" className="relative mt-3 text-xs leading-relaxed text-muted">
              {shareNotice}
            </p>
          )}
        </section>
      )}

      {billing && (
        <p className="mt-3 text-center text-[11px] text-muted/80 tabular-nums">
          {billing.chargedTokens > 0
            ? `${billing.chargedTokens.toLocaleString("en-US")} token ditolak · baki ${billing.balanceAfter.toLocaleString("en-US")}`
            : "Tiada token ditolak untuk penjanaan ini"}
        </p>
      )}
    </div>
  );
}

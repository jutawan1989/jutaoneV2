"use client";

import { useId, useState } from "react";
import { BellRing, Send } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { whatsappShortFor, whatsappUrl } from "@/lib/contact";

/**
 * Waitlist form (Lead Ads landing). Posts `{ name, email }` to
 * `/api/waitlist` — the contract the Hermes backend will adopt.
 * Until a store is wired the API answers 503 honestly and the UI offers the
 * WhatsApp fallback, so no lead is ever silently lost.
 */
export function WaitlistForm({ dict, locale }: { dict: Dictionary; locale?: Locale }) {
  const copy = dict.waitlist;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [invalidInput, setInvalidInput] = useState(false);
  const nameId = useId();
  const emailId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setInvalidInput(false);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), source: "website-waitlist" }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; code?: string } | null;
      if (response.ok && data?.ok) {
        setState("done");
      } else {
        setState("error");
        // Backend contract (lib/leads.ts): input problems vs store problems.
        setInvalidInput(
          data?.code === "name_required" ||
            data?.code === "contact_required" ||
            data?.code === "email_invalid" ||
            data?.code === "phone_invalid",
        );
      }
    } catch {
      setState("error");
      setInvalidInput(false);
    }
  }

  if (state === "done") {
    return (
      <div
        role="status"
        className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] px-6 py-8 text-center"
      >
        <BellRing className="mx-auto size-8 text-emerald-300" aria-hidden />
        <p className="mt-3 text-xl font-semibold text-white">{copy.successTitle}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{copy.successBody}</p>
      </div>
    );
  }

  const inputClass =
    "min-h-[48px] w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-[15px] text-white placeholder:text-muted/70 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none";

  return (
    <form onSubmit={submit} className="space-y-4" noValidate={false}>
      <div>
        <label htmlFor={nameId} className="text-sm font-medium text-white">
          {copy.nameLabel}
        </label>
        <input
          id={nameId}
          type="text"
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={copy.namePlaceholder}
          className={`mt-1.5 ${inputClass}`}
        />
      </div>
      <div>
        <label htmlFor={emailId} className="text-sm font-medium text-white">
          {copy.emailLabel}
        </label>
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={copy.emailPlaceholder}
          className={`mt-1.5 ${inputClass}`}
        />
      </div>
      {state === "error" && (
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3">
          <p className="text-sm font-medium text-amber-200">
            {invalidInput ? copy.errorInvalid : copy.errorUnavailable}
          </p>
          {!invalidInput && (
            <p className="mt-1.5 text-sm text-slate-300">
              <a
                href={whatsappUrl(dict.contact.prefill, locale ?? "ms")}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-emerald-400 underline-offset-2 hover:underline"
              >
                WhatsApp {whatsappShortFor(locale ?? "ms")}
              </a>
            </p>
          )}
        </div>
      )}
      <button
        type="submit"
        disabled={state === "sending"}
        className="btn-brand btn-glow cta-glow flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-base font-bold disabled:opacity-60"
      >
        {state === "sending" ? (
          <span
            aria-hidden
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
        ) : (
          <span className="inline-flex items-center justify-center gap-2">
            <Send className="size-4" aria-hidden />
            {copy.submit}
          </span>
        )}
      </button>
    </form>
  );
}

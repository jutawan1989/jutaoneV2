"use client";

import { useId, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import type { Variant } from "@/lib/analytics/variant";

/**
 * Starts the Chip.Asia top-up: the API logs `topup_click` and returns the
 * hosted checkout URL (or the sandbox page when Chip is not configured yet).
 */
export function TopUpButton({
  locale,
  variant,
  className = "btn-brand w-full",
  children,
  errorText,
  emailErrorText,
  emailLabel,
  emailPlaceholder,
  trustBadge,
  disabled = false,
  amountUsd,
  collectEmail = false,
  gateway = "toyyibpay",
}: {
  locale: Locale;
  variant: Variant;
  className?: string;
  children: ReactNode;
  errorText: string;
  emailErrorText?: string;
  emailLabel?: string;
  emailPlaceholder?: string;
  /** Small trust line rendered under the CTA (e.g. "Secure payment by Chip.Asia"). */
  trustBadge?: string;
  disabled?: boolean;
  /** Top-up size in USD. Defaults to $1 when omitted. */
  amountUsd?: number;
  /** When true, render an email field and send it as the Chip OTP destination. */
  collectEmail?: boolean;
  /** Explicit gateway override — "stripe" sends `gateway: "stripe"` to `/api/topup`. */
  gateway?: "toyyibpay" | "stripe";
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [email, setEmail] = useState("");
  const [emailInvalid, setEmailInvalid] = useState(false);
  const emailId = useId();

  async function handleClick() {
    if (busy) return;
    let trimmedEmail: string | undefined;
    if (collectEmail) {
      trimmedEmail = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
        setEmailInvalid(true);
        setFailed(false);
        return;
      }
      setEmailInvalid(false);
    }
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/topup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locale,
          variant,
          amountUsd,
          email: trimmedEmail,
          ...(gateway === "stripe" ? { gateway: "stripe" } : {}),
        }),
      });
      const data = (await response.json()) as { checkoutUrl?: string | null };
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      {collectEmail && (
        <div className="mb-4">
          <label
            htmlFor={emailId}
            className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase"
          >
            {emailLabel}
          </label>
          <input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            placeholder={emailPlaceholder}
            onChange={(event) => {
              setEmail(event.target.value);
              if (emailInvalid) setEmailInvalid(false);
            }}
            aria-invalid={emailInvalid}
            aria-describedby={emailInvalid ? `${emailId}-error` : undefined}
            className={`mt-1.5 w-full rounded-xl border bg-white/[0.02] px-3.5 py-3 text-sm font-medium text-white placeholder:font-normal placeholder:text-muted/70 focus:ring-1 focus:outline-none ${
              emailInvalid
                ? "border-red-400/60 focus:border-red-400 focus:ring-red-400/40"
                : "border-white/[0.08] focus:border-brand focus:ring-brand"
            }`}
          />
          {emailInvalid && emailErrorText && (
            <p id={`${emailId}-error`} role="alert" className="mt-1.5 text-xs text-red-300">
              {emailErrorText}
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || disabled}
        aria-busy={busy}
        className={className}
      >
        {busy ? (
          <span
            aria-hidden
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
        ) : (
          <span className="inline-flex items-center justify-center gap-2">
            <Lock className="size-4" aria-hidden />
            {children}
          </span>
        )}
      </button>
      {failed && (
        <p role="alert" className="mt-2 text-center text-xs text-red-300">
          {errorText}
        </p>
      )}
      {trustBadge && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] leading-relaxed text-muted">
          <Lock className="size-3 shrink-0 text-emerald-400" aria-hidden />
          {trustBadge}
        </p>
      )}
    </div>
  );
}

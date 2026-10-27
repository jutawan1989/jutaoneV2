"use client";

import { useId, useState, type ReactNode } from "react";
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
  disabled = false,
  amountUsd,
  collectEmail = false,
}: {
  locale: Locale;
  variant: Variant;
  className?: string;
  children: ReactNode;
  errorText: string;
  emailErrorText?: string;
  emailLabel?: string;
  emailPlaceholder?: string;
  disabled?: boolean;
  /** Top-up size in USD. Defaults to $1 when omitted. */
  amountUsd?: number;
  /** When true, render an email field and send it as the Chip OTP destination. */
  collectEmail?: boolean;
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
        body: JSON.stringify({ locale, variant, amountUsd, email: trimmedEmail }),
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
        <div className="mb-3">
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
            className="mt-1.5 w-full rounded-lg border border-line bg-white/[0.02] py-2.5 px-3 text-sm font-medium text-white placeholder:font-normal placeholder:text-muted/70 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
          />
          {emailInvalid && emailErrorText && (
            <p role="alert" className="mt-1.5 text-xs text-red-300">
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
          children
        )}
      </button>
      {failed && (
        <p role="alert" className="mt-2 text-center text-xs text-red-300">
          {errorText}
        </p>
      )}
    </div>
  );
}

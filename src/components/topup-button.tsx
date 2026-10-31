"use client";

import { useId, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import type { Variant } from "@/lib/analytics/variant";
import { whatsappShortFor, whatsappUrl } from "@/lib/contact";

/**
 * Starts the Stripe top-up: the API logs `topup_click` and returns the
 * Stripe Checkout URL (or the sandbox page when Stripe is not configured).
 * ToyyibPay is CLOSED — every checkout sends `gateway: "stripe"`.
 */

/** Exact JSON body POSTed to `/api/topup` (always Stripe). */
export type TopUpRequestBody = {
  locale: Locale;
  variant: Variant;
  gateway: "stripe";
  amountUsd?: number;
  email?: string;
};

/**
 * Builds the `/api/topup` request body. Pure (unit-tested): the gateway
 * is always `"stripe"` — Curlec is closed.
 */
export function buildTopUpRequestBody(input: {
  locale: Locale;
  variant: Variant;
  amountUsd?: number;
  email?: string;
}): TopUpRequestBody {
  return {
    locale: input.locale,
    variant: input.variant,
    // ToyyibPay/Curlec CLOSED: always route via Stripe.
    gateway: "stripe",
    amountUsd: input.amountUsd,
    email: input.email,
  };
}

/** Failure classes with distinct UI copy (never a bare "masalah teknikal"). */
export type TopUpFailure = "email" | "service" | "checkout" | "failed" | "generic";

/**
 * Maps an API error `code` (+ HTTP `status` when the body is missing) to a
 * failure class. `invalid_email` (400, empty email) means the receipt address
 * was rejected — never show the generic "masalah teknikal" for it.
 * `topup_unavailable` (502) means Stripe itself failed — nothing was charged,
 * retry is safe. Generic ("Alamak, ada masalah teknikal") is reserved for
 * true server failures (5xx).
 */
export function classifyTopUpErrorCode(code: unknown, status?: unknown): TopUpFailure {
  if (code === "invalid_email") return "email";
  if (code === "topup_unavailable") return "service";
  if (typeof status === "number") {
    // Body-less 400 (e.g. proxy strips JSON): empty email is the only 400
    // this endpoint emits without a specific code path — treat as email.
    if (status === 400 && (code == null || code === "")) return "email";
    if (status === 502 || status === 503 || status === 504) return "service";
    if (status >= 500) return "generic";
  }
  return "generic";
}

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
  whatsappNote,
  whatsappLinkLabel,
  whatsappPrefill,
}: {
  locale: Locale;
  variant: Variant;
  className?: string;
  children: ReactNode;
  errorText: string;
  emailErrorText?: string;
  emailLabel?: string;
  emailPlaceholder?: string;
  /** Small trust line rendered under the CTA (e.g. "Secure payment by Stripe"). */
  trustBadge?: string;
  /** Help line under the pay button: "Questions before paying? WhatsApp us: …". */
  whatsappNote?: string;
  /** Label before the WhatsApp number link (e.g. "WhatsApp us:"). */
  whatsappLinkLabel?: string;
  /** Pre-filled wa.me message. */
  whatsappPrefill?: string;
  disabled?: boolean;
  /** Top-up size in USD. Defaults to $1 when omitted. */
  amountUsd?: number;
  /** When true, render an email field and send it as the receipt destination. */
  collectEmail?: boolean;
  /** Gateway override — always `"stripe"` (ToyyibPay closed). Kept as a prop for tests. */
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
        body: JSON.stringify(buildTopUpRequestBody({ locale, variant, amountUsd, email: trimmedEmail })),
      });
      // A non-JSON error page (proxy 502/HTML) must not crash — classify it.
      const data = (await response.json().catch(() => null)) as { checkoutUrl?: string | null } | null;
      if (!response.ok) {
        setFailed(true);
        return;
      }
      if (data?.checkoutUrl) {
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
      {whatsappNote && whatsappLinkLabel && whatsappPrefill && (
        <p className="mt-2 text-center text-xs leading-relaxed text-muted">
          {whatsappNote}{" "}
          <a
            href={whatsappUrl(whatsappPrefill, locale)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-emerald-400 underline-offset-2 hover:underline"
          >
            {whatsappLinkLabel} {whatsappShortFor(locale)}
          </a>
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

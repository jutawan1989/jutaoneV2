"use client";

import { useId, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import type { Variant } from "@/lib/analytics/variant";
import { whatsappShortFor, whatsappUrl } from "@/lib/contact";

/**
 * Curlec-only top-up: creates a Curlec/Razorpay order via `/api/topup` and
 * opens Razorpay Checkout.js modal (or redirects in mock mode).
 * Stripe is CLOSED — every checkout sends `gateway: "curlec"`.
 */
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on?: (e: string, h: (r: unknown) => void) => void };
  }
}

function loadRazorpayCheckout(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
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
  amountMyr,
  international = false,
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
  /** Small trust line rendered under the CTA (e.g. "Secure payment by Curlec"). */
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
  /** Top-up size in MYR for `gateway: "curlec"`. */
  amountMyr?: number;
  /** True when the payer declares a foreign card (locks +3% Curlec surcharge). */
  international?: boolean;
  /** When true, render an email field and send it as the receipt destination. */
  collectEmail?: boolean;
  /** Gateway selector: `"curlec"` only (Stripe CLOSED). Kept as a prop for tests. */
  gateway?: "curlec";
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
        body: JSON.stringify(
          // Stripe CLOSED: always route via Curlec.
          { locale, variant, gateway: "curlec", amountMyr, international, email: trimmedEmail },
        ),
      });
      const data = (await response.json()) as {
        checkoutUrl?: string | null;
        orderId?: string | null;
        keyId?: string | null;
        reference?: string | null;
        amountSen?: number | null;
      };
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      // Curlec live mode: no redirect — open Razorpay Checkout.js with the order.
      if (data.orderId && data.keyId && data.reference) {
        const ready = await loadRazorpayCheckout();
        if (!ready || !window.Razorpay) {
          setFailed(true);
          setBusy(false);
          return;
        }
        const rzp = new window.Razorpay({
          key: data.keyId,
          order_id: data.orderId,
          amount: data.amountSen ?? undefined,
          currency: "MYR",
          name: "JutaOne.Biz",
          description: "Token top-up",
          prefill: trimmedEmail ? { email: trimmedEmail } : undefined,
          theme: { color: "#0B1220" },
          handler: () => {
            window.location.href = `/${locale}/topup?status=success&ref=${encodeURIComponent(data.reference as string)}`;
          },
          modal: { ondismiss: () => setBusy(false) },
        });
        rzp.open();
        if (typeof rzp.on === "function") {
          rzp.on("payment.failed", () => {
            setFailed(true);
            setBusy(false);
          });
        }
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

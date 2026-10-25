"use client";

import { useState, type ReactNode } from "react";
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
  disabled = false,
  amountUsd,
}: {
  locale: Locale;
  variant: Variant;
  className?: string;
  children: ReactNode;
  errorText: string;
  disabled?: boolean;
  /** Top-up size in USD. Defaults to $1 when omitted. */
  amountUsd?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/topup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, variant, amountUsd }),
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

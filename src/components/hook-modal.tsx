"use client";

import { useEffect, useRef } from "react";
import { sendEvent } from "@/lib/analytics/client";
import type { Dictionary } from "@/lib/i18n";
import { format, type Locale } from "@/lib/i18n/config";
import type { Variant } from "@/lib/analytics/variant";
import { TopUpButton } from "@/components/topup-button";

type HookModalProps = {
  open: boolean;
  locale: Locale;
  variant: Variant;
  dict: Dictionary;
  priceDisplay: string;
  currency: string;
  tokenName: string;
  onClose: () => void;
};

/**
 * D4 paywall hook. Variant A sells on price, variant B sells on the outcome;
 * the variant is assigned server-side and logged with every event.
 */
export function HookModal({
  open,
  locale,
  variant,
  dict,
  priceDisplay,
  currency,
  tokenName,
  onClose,
}: HookModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const copy = variant === "A" ? dict.hook.variantA : dict.hook.variantB;
  const values = { price: priceDisplay, tokenName, currency };

  useEffect(() => {
    if (!open) return;
    sendEvent({ event: "hook_view", locale, variant, props: { variant } });

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open, locale, variant, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hook-title"
        className="modal-enter card relative w-full max-w-md p-6 sm:p-7"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={dict.hook.dismissLabel}
          className="absolute top-4 right-4 rounded-full border border-line px-2 py-1 text-xs text-muted transition-colors hover:text-white"
        >
          ✕
        </button>

        <p className="text-xs font-semibold tracking-wide text-brand-soft uppercase">{copy.label}</p>
        <h2 id="hook-title" className="mt-2 pr-8 text-2xl font-extrabold text-white">
          {copy.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">{format(copy.body, values)}</p>

        <div className="mt-5 flex items-baseline justify-between rounded-xl border border-line/80 bg-ink/60 px-4 py-3">
          <span className="text-sm text-muted">{dict.pricing.tokenName}</span>
          <span className="text-xl font-extrabold text-brand">{priceDisplay}</span>
        </div>

        <div className="mt-5">
          <TopUpButton
            locale={locale}
            variant={variant}
            errorText={dict.generator.errorGeneric}
            className="btn-brand w-full"
          >
            {format(copy.cta, values)}
          </TopUpButton>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-full py-2 text-sm font-medium text-muted transition-colors hover:text-white"
        >
          {dict.hook.close}
        </button>

        <p className="mt-4 border-t border-line/70 pt-3 text-[11px] leading-relaxed text-muted/80">
          {format(copy.note, values)}. {dict.compliance.noGuarantee}
        </p>
      </div>
    </div>
  );
}

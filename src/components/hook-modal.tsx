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
  const dialogRef = useRef<HTMLDivElement>(null);
  const copy = variant === "A" ? dict.hook.variantA : dict.hook.variantB;
  const values = { price: priceDisplay, tokenName, currency };

  useEffect(() => {
    if (!open) return;
    sendEvent({ event: "hook_view", locale, variant, props: { variant } });

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function focusable(): HTMLElement[] {
      const root = dialogRef.current;
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // Keep focus inside the dialog: this is what `aria-modal` promises.
      const items = focusable();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = Boolean(dialogRef.current?.contains(active));

      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
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
        ref={dialogRef}
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
          className="absolute top-4 right-4 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-line text-xs text-muted transition-colors hover:border-[#334155] hover:text-white"
        >
          ✕
        </button>

        <p className="text-[11px] font-medium tracking-[0.12em] text-brand uppercase">{copy.label}</p>
        <h2
          id="hook-title"
          className="mt-2.5 pr-8 text-xl font-semibold tracking-[-0.02em] text-white"
        >
          {copy.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">{format(copy.body, values)}</p>

        <div className="mt-5 flex items-baseline justify-between rounded-lg border border-line bg-ink/50 px-4 py-3">
          <span className="text-sm text-muted">{dict.pricing.tokenName}</span>
          <span className="text-xl font-semibold text-white tabular-nums">{priceDisplay}</span>
        </div>

        <div className="mt-5">
          <TopUpButton
            locale={locale}
            variant={variant}
            errorText={dict.generator.errorGeneric}
            emailErrorText={dict.pricing.invalidEmail}
            emailLabel={dict.pricing.emailLabel}
            emailPlaceholder={dict.pricing.emailPlaceholder}
            className="btn-brand btn-glow cta-glow min-h-[52px] w-full text-base font-bold"
            collectEmail
            whatsappNote={dict.pricing.whatsappNote}
            whatsappLinkLabel={dict.contact.linkLabel}
            whatsappPrefill={dict.contact.prefill}
          >
            {format(copy.cta, values)}
          </TopUpButton>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 min-h-[44px] w-full rounded-md py-2 text-sm font-medium text-muted transition-colors hover:text-white"
        >
          {dict.hook.close}
        </button>

        <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted/80">
          {format(copy.note, values)}. {dict.compliance.noGuarantee}
        </p>
      </div>
    </div>
  );
}

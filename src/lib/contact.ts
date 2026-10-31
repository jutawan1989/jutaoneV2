import type { Locale } from "@/lib/i18n/config";

/**
 * Official JutaOne.Biz contact channels (Boss spec).
 *
 * Malaysia (BM/EN): +601****5880 (wa.me/601149655880)
 * Indonesia (ID):   +628****8208 (wa.me/6287892768208)
 *
 * Build-time override (optional): set these public vars to change the
 * number without a code edit —
 *   NEXT_PUBLIC_SUPPORT_WA_MY=601149655880
 *   NEXT_PUBLIC_SUPPORT_WA_ID=6287892768208
 * Digits only (no `+`, spaces or dashes). An invalid value falls back to
 * the Boss-specified number above and is normalised on first read by
 * `normaliseOverride`.
 *
 * Floating WhatsApp button, top-up help line, waitlist fallback and footer
 * all point here so the numbers live in exactly one place. Locale-aware:
 * `id` → Indonesia, everything else (`ms`/`en`) → Malaysia.
 */

const FALLBACK_MY_DIGITS = "601149655880";
const FALLBACK_ID_DIGITS = "6287892768208";

/** Build-time override: digits only, otherwise ignored (falls back). */
function normaliseOverride(value: string | undefined, fallback: string): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return /^\d{8,16}$/.test(digits) ? digits : fallback;
}

/** Active Malaysia digits: env override wins, Boss number is the fallback. */
export function supportWaMyDigits(): string {
  return normaliseOverride(process.env.NEXT_PUBLIC_SUPPORT_WA_MY, FALLBACK_MY_DIGITS);
}

/** Active Indonesia digits: env override wins, Boss number is the fallback. */
export function supportWaIdDigits(): string {
  return normaliseOverride(process.env.NEXT_PUBLIC_SUPPORT_WA_ID, FALLBACK_ID_DIGITS);
}

/** Display helpers: derive human formats from any digits string. */
function shortFrom(digits: string): string {
  if (digits.startsWith("60") && digits.length >= 10) {
    const rest = digits.slice(2);
    return `0${rest.slice(0, 3)}-${rest.slice(3, 7)} ${rest.slice(7, 11)}`.trimEnd();
  }
  if (digits.startsWith("62") && digits.length >= 10) {
    const rest = digits.slice(2);
    return `0${rest.slice(0, 3)}-${rest.slice(3, 7)} ${rest.slice(7, 11)}`.trimEnd();
  }
  return digits;
}

function intlFrom(digits: string): string {
  if (digits.startsWith("60"))
    return `+${digits.slice(0, 4)}-${digits.slice(4, 8)} ${digits.slice(8, 12)}`.trimEnd();
  if (digits.startsWith("62"))
    return `+62 ${digits.slice(2, 5)}-${digits.slice(5, 9)} ${digits.slice(9, 13)}`.trimEnd();
  return `+${digits}`;
}

/** Masked tel: link — keeps the full number out of the markup. */
function maskedTelFrom(digits: string): string {
  return `tel:+${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

export const WHATSAPP_MY_DIGITS = FALLBACK_MY_DIGITS;
export const WHATSAPP_MY_SHORT = "011-4965 5880";
export const WHATSAPP_MY_INTL = "+6011-4965 5880";
export const WHATSAPP_MY_TEL_URL = "tel:+601149655880";

export const WHATSAPP_ID_DIGITS = "6287892768208";
export const WHATSAPP_ID_SHORT = "0878-9276 8208";
export const WHATSAPP_ID_INTL = "+62 878-9276 8208";
export const WHATSAPP_ID_TEL_URL = "tel:+6287892768208";

/** Legacy default (Malaysia) — kept so old imports keep working. */
export const WHATSAPP_DIGITS = WHATSAPP_MY_DIGITS;
/** Human display, Malaysian format. */
export const WHATSAPP_NUMBER_SHORT = WHATSAPP_MY_SHORT;
/** Human display, international format. */
export const WHATSAPP_NUMBER_INTL = WHATSAPP_MY_INTL;
export const WHATSAPP_TEL_URL = WHATSAPP_MY_TEL_URL;

export function isIdLocale(locale: Locale | string | undefined | null): boolean {
  return locale === "id";
}

/** wa.me digits for the active locale (env override wins). */
export function whatsappDigitsFor(locale: Locale | string | undefined | null): string {
  return isIdLocale(locale) ? supportWaIdDigits() : supportWaMyDigits();
}

/** Human short display for the active locale. */
export function whatsappShortFor(locale: Locale | string | undefined | null): string {
  if (isIdLocale(locale)) {
    const digits = supportWaIdDigits();
    return digits === FALLBACK_ID_DIGITS ? WHATSAPP_ID_SHORT : shortFrom(digits);
  }
  const digits = supportWaMyDigits();
  return digits === FALLBACK_MY_DIGITS ? WHATSAPP_MY_SHORT : shortFrom(digits);
}

/** Human international display for the active locale. */
export function whatsappIntlFor(locale: Locale | string | undefined | null): string {
  if (isIdLocale(locale)) {
    const digits = supportWaIdDigits();
    return digits === FALLBACK_ID_DIGITS ? WHATSAPP_ID_INTL : intlFrom(digits);
  }
  const digits = supportWaMyDigits();
  return digits === FALLBACK_MY_DIGITS ? WHATSAPP_MY_INTL : intlFrom(digits);
}

/** tel: link for the active locale. */
export function whatsappTelUrlFor(locale: Locale | string | undefined | null): string {
  if (isIdLocale(locale)) {
    const digits = supportWaIdDigits();
    return digits === FALLBACK_ID_DIGITS ? WHATSAPP_ID_TEL_URL : maskedTelFrom(digits);
  }
  const digits = supportWaMyDigits();
  return digits === FALLBACK_MY_DIGITS ? WHATSAPP_MY_TEL_URL : maskedTelFrom(digits);
}

/** wa.me chat link with a locale-aware pre-filled message. */
export function whatsappUrl(
  prefill: string,
  locale?: Locale | string | undefined | null,
): string {
  return `https://wa.me/${whatsappDigitsFor(locale)}?text=${encodeURIComponent(prefill)}`;
}

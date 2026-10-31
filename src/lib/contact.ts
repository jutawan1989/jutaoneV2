/**
 * Official JutaOne.Biz contact channel (Boss spec).
 *
 * Floating WhatsApp button (site-wide), top-up help line, and footer all
 * point here so the number lives in exactly one place.
 */

export const WHATSAPP_DIGITS = "601155919344";
/** Human display, Malaysian format. */
export const WHATSAPP_NUMBER_SHORT = "011-5591 9344";
/** Human display, international format. */
export const WHATSAPP_NUMBER_INTL = "+6011-5591 9344";
export const WHATSAPP_TEL_URL = "tel:+601155919344";

/** wa.me chat link with a locale-aware pre-filled message. */
export function whatsappUrl(prefill: string): string {
  return `https://wa.me/${WHATSAPP_DIGITS}?text=${encodeURIComponent(prefill)}`;
}

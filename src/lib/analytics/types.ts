import type { Locale, Region } from "@/lib/i18n/config";
import type { Variant } from "@/lib/analytics/variant";

export const ANALYTICS_EVENTS = [
  "demo_start",
  "demo_success",
  "demo_limit_reached",
  "demo_blocked_killswitch",
  "hook_view",
  "topup_click",
  "topup_success",
  // Store Rent is a separate product from tokens, so it gets its own event
  // rather than being folded into topup_success: revenue reporting has to be
  // able to tell a subscription from a token sale.
  "rent_success",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type UtmParams = Partial<Record<(typeof UTM_KEYS)[number], string>>;

export type EventInput = {
  event: AnalyticsEvent;
  locale: Locale;
  region: Region;
  variant: Variant;
  utm?: UtmParams;
  /** Salted visitor hash. Never an IP or any other PII. */
  visitorKey?: string;
  props?: Record<string, unknown>;
};

export function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  return typeof value === "string" && (ANALYTICS_EVENTS as readonly string[]).includes(value);
}

/** Parses UTM params from a query string. Safe on both server and client. */
export function parseUtm(search: string): UtmParams {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const utm: UtmParams = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) utm[key] = value.slice(0, 120);
  }
  return utm;
}

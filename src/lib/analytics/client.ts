"use client";

import type { Locale } from "@/lib/i18n/config";
import type { Variant } from "@/lib/analytics/variant";
import { UTM_KEYS, type AnalyticsEvent, type UtmParams } from "./types";

const UTM_STORAGE_KEY = "jo_utm";

/**
 * UTM params only exist on the landing URL, while events are POSTed to an API
 * route. Capture them once per session so later events keep their attribution.
 */
export function captureUtm(): UtmParams {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const fromUrl: UtmParams = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) fromUrl[key] = value.slice(0, 120);
  }

  if (Object.keys(fromUrl).length > 0) {
    try {
      window.sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(fromUrl));
    } catch {
      // Storage can be blocked; the URL params are still used below.
    }
    return fromUrl;
  }

  try {
    const stored = window.sessionStorage.getItem(UTM_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as UtmParams) : {};
  } catch {
    return {};
  }
}

export function sendEvent(input: {
  event: AnalyticsEvent;
  locale: Locale;
  variant: Variant;
  props?: Record<string, unknown>;
}): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({
    event: input.event,
    locale: input.locale,
    variant: input.variant,
    utm: captureUtm(),
    props: input.props ?? {},
  });

  try {
    void fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Analytics must never throw into the UI.
  }
}

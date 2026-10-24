import { LOCALES, localeForRegion, type Locale, type Region } from "@/lib/i18n/config";

export const LOCALE_COOKIE = "jo_locale";

/**
 * Resolve the visitor region. Cloudflare sets `cf-ipcountry` on every request
 * served through Pages, so no external geo API is needed.
 * `FORCE_REGION` exists for local development and QA only.
 */
export function detectRegion(headers: Headers): Region {
  const forced = process.env.FORCE_REGION?.toUpperCase();
  if (forced === "MY" || forced === "ID" || forced === "OTHER") {
    return forced;
  }

  const country = headers.get("cf-ipcountry")?.toUpperCase();
  if (country === "MY") return "MY";
  if (country === "ID") return "ID";
  if (country && country !== "XX" && country !== "T1") return "OTHER";

  // Local/dev fallback: infer from the accepted languages.
  const accept = (headers.get("accept-language") ?? "").toLowerCase();
  if (/(^|[,;]\s*)ms\b/.test(accept)) return "MY";
  if (/(^|[,;]\s*)id\b/.test(accept)) return "ID";
  return "OTHER";
}

export function detectLocale(headers: Headers): Locale {
  const cookie = readCookie(headers.get("cookie"), LOCALE_COOKIE);
  if (cookie && (LOCALES as readonly string[]).includes(cookie)) {
    return cookie as Locale;
  }
  return localeForRegion(detectRegion(headers));
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

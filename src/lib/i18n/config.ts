export const LOCALES = ["en", "ms", "id"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export type Region = "MY" | "ID" | "OTHER";

export type LocaleMeta = {
  /** Label shown in the language switcher. */
  label: string;
  /** Short label for compact switchers. */
  short: string;
  /** Value for the <html lang> attribute. */
  htmlLang: string;
  /** Value for the hreflang alternates. */
  hreflang: string;
  /** Region this locale is written for. `OTHER` uses the base currency. */
  region: Region;
};

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { label: "English", short: "EN", htmlLang: "en", hreflang: "en", region: "OTHER" },
  ms: { label: "Bahasa Melayu", short: "BM", htmlLang: "ms-MY", hreflang: "ms-MY", region: "MY" },
  id: { label: "Bahasa Indonesia", short: "BI", htmlLang: "id-ID", hreflang: "id-ID", region: "ID" },
};

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * Locale used for a visitor's region. Requirement D6: MY -> BM, ID -> BI,
 * everything else -> EN.
 */
export function localeForRegion(region: Region): Locale {
  switch (region) {
    case "MY":
      return "ms";
    case "ID":
      return "id";
    default:
      return "en";
  }
}

export function localePath(locale: Locale, path = ""): string {
  if (!path || path === "/") return `/${locale}`;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${normalized}`;
}

/** Interpolates `{name}` placeholders. Missing keys are left untouched. */
export function format(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

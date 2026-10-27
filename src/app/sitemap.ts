import type { MetadataRoute } from "next";
import { LOCALES, LOCALE_META } from "@/lib/i18n/config";

/**
 * One entry per locale, each listing every language as an alternate. This
 * mirrors the hreflang tags emitted in `[locale]/layout.tsx` so search engines
 * see a consistent set.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const lastModified = new Date();

  const languages = Object.fromEntries(
    LOCALES.map((locale) => [LOCALE_META[locale].hreflang, `${siteUrl}/${locale}`]),
  );

  return LOCALES.map((locale) => ({
    url: `${siteUrl}/${locale}`,
    lastModified,
    changeFrequency: "weekly",
    priority: locale === "ms" ? 1 : 0.9,
    alternates: {
      languages: { ...languages, "x-default": `${siteUrl}/ms` },
    },
  }));
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import { LOCALE_META, LOCALES, isLocale, type Locale } from "@/lib/i18n/config";

/** Self-hosted at build time by next/font: no third-party request at runtime. */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

type LocaleParams = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const dict = getDictionary(locale);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    metadataBase: new URL(siteUrl),
    title: dict.meta.title,
    description: dict.meta.description,
    alternates: {
      canonical: `/${locale}`,
      languages: {
        "ms-MY": "/ms",
        "id-ID": "/id",
        en: "/en",
        "x-default": "/en",
      },
    },
    openGraph: {
      type: "website",
      siteName: "JutaOne.Biz",
      title: dict.meta.title,
      description: dict.meta.description,
      locale: LOCALE_META[locale].htmlLang.replace("-", "_"),
      url: `/${locale}`,
    },
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleParams & { children: ReactNode }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dict = getDictionary(locale as Locale);

  return (
    <html lang={LOCALE_META[locale as Locale].htmlLang} className={inter.variable}>
      <body className="min-h-dvh bg-ink font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-brand-strong focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          {dict.a11y.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}

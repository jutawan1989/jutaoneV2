import Link from "next/link";
import { Logo } from "@/components/logo";
import { LOCALES, LOCALE_META, localePath, type Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n";
import type { Price } from "@/lib/pricing";

export function LanguageSwitcher({
  locale,
  pathSuffix = "",
  label,
}: {
  locale: Locale;
  pathSuffix?: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex items-center gap-1 rounded-full border border-line/80 bg-white/[0.03] p-1">
      {LOCALES.map((candidate) => {
        const active = candidate === locale;
        return (
          <Link
            key={candidate}
            href={localePath(candidate, pathSuffix)}
            hrefLang={LOCALE_META[candidate].hreflang}
            aria-current={active ? "true" : undefined}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
              active ? "bg-gold text-ink" : "text-muted hover:text-white"
            }`}
          >
            {LOCALE_META[candidate].short}
          </Link>
        );
      })}
    </nav>
  );
}

export function Navbar({
  locale,
  dict,
  price,
  pathSuffix = "",
}: {
  locale: Locale;
  dict: Dictionary;
  price: Price;
  pathSuffix?: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo locale={locale} />

        <nav className="hidden items-center gap-7 text-sm font-medium text-muted md:flex">
          <Link href="#demo" className="transition-colors hover:text-white">
            {dict.nav.demo}
          </Link>
          <Link href="#gold" className="transition-colors hover:text-white">
            {dict.nav.gold}
          </Link>
          <Link href="#pricing" className="transition-colors hover:text-white">
            {dict.nav.pricing}
          </Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher locale={locale} pathSuffix={pathSuffix} label={dict.nav.languageLabel} />
          <Link href="#pricing" className="btn-gold hidden px-4 py-2 text-sm sm:inline-flex">
            {dict.nav.cta.replace("{price}", price.display)}
          </Link>
        </div>
      </div>
    </header>
  );
}

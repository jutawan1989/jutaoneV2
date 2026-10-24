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
    <nav
      aria-label={label}
      className="flex items-center gap-0.5 rounded-md border border-line bg-white/[0.02] p-0.5"
    >
      {LOCALES.map((candidate) => {
        const active = candidate === locale;
        return (
          <Link
            key={candidate}
            href={localePath(candidate, pathSuffix)}
            hrefLang={LOCALE_META[candidate].hreflang}
            aria-current={active ? "true" : undefined}
            className={`rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors ${
              active ? "bg-surface-2 text-white" : "text-muted hover:text-white"
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
    <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo locale={locale} />

        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
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
          <Link href="#pricing" className="btn-brand hidden px-3.5 py-2 sm:inline-flex">
            {dict.nav.cta.replace("{price}", price.display)}
          </Link>
        </div>
      </div>
    </header>
  );
}

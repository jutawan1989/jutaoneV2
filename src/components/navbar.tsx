import Image from "next/image";
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
      className="flex min-w-0 max-w-full items-center gap-0.5 rounded-md border border-line bg-white/[0.02] p-0.5"
    >
      {/* Boss spec: order BM | ID | EN (LOCALES is ["ms","id","en"]), active pill is solid brand. */}
      {LOCALES.map((candidate) => {
        const active = candidate === locale;
        return (
          <Link
            key={candidate}
            href={localePath(candidate, pathSuffix)}
            hrefLang={LOCALE_META[candidate].hreflang}
            aria-current={active ? "true" : undefined}
            aria-label={LOCALE_META[candidate].label}
            title={LOCALE_META[candidate].label}
            className={`flex min-h-[44px] items-center rounded-[5px] px-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors sm:px-2.5 sm:text-xs ${
              active
                ? "bg-brand text-white shadow-[0_2px_10px_-2px_rgba(37,99,235,0.8)]"
                : "text-muted hover:bg-white/[0.06] hover:text-white"
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
  signedIn = false,
}: {
  locale: Locale;
  dict: Dictionary;
  price: Price;
  pathSuffix?: string;
  signedIn?: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 max-w-full overflow-x-clip border-b border-line bg-ink/85 backdrop-blur-md">
      {/* Mobile-first: tight padding/gaps so logo + switcher + CTA + menu fit 375px. */}
      <div className="mx-auto flex h-16 w-full max-w-6xl min-w-0 items-center justify-between gap-1.5 px-4 sm:gap-4 sm:px-6">
        <Logo locale={locale} compact />

        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
          <Link href="#demo" className="transition-colors hover:text-white">
            {dict.nav.demo}
          </Link>
          <Link href="#gold" className="transition-colors hover:text-white">
            {dict.nav.gold}
          </Link>
          <Link
            href="/directory"
            className="btn-glow flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 py-1 pr-3 pl-1 font-semibold text-brand-soft transition-colors hover:border-brand hover:text-white"
          >
            <Image
              src="/assets/biz-match.jpg"
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 rounded-full object-cover ring-1 ring-white/20"
              unoptimized
            />
            {dict.nav.suppliers}
          </Link>
          <Link href="#pricing" className="transition-colors hover:text-white">
            {dict.nav.pricing}
          </Link>
        </nav>

        <div className="flex min-w-0 max-w-full shrink items-center gap-1.5 sm:gap-3">
          <LanguageSwitcher locale={locale} pathSuffix={pathSuffix} label={dict.nav.languageLabel} />
          {signedIn ? (
            <Link href="/dashboard" className="btn-brand min-h-[44px] px-3.5 py-2 sm:inline-flex">
              {dict.nav.dashboard}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden min-h-[44px] items-center px-3.5 py-2 text-sm font-medium whitespace-nowrap text-muted transition-colors hover:text-white sm:inline-flex"
              >
                {dict.nav.login}
              </Link>
              <Link href="/register" className="btn-brand btn-glow inline-flex min-h-[44px] items-center px-2.5 py-2 text-[13px] font-semibold whitespace-nowrap sm:hidden sm:px-3.5 sm:text-sm">
                {dict.nav.register}
              </Link>
              <Link href="/register" className="btn-brand hidden min-h-[44px] items-center px-3.5 py-2 sm:inline-flex">
                {dict.nav.register}
              </Link>
            </>
          )}
          <details className="group relative md:hidden">
            <summary
              aria-label="Menu"
              className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg border border-line text-silver transition-colors hover:text-white [&::-webkit-details-marker]:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </summary>
            <nav className="absolute top-12 right-0 z-50 flex w-56 flex-col gap-1 rounded-xl border border-line bg-ink-2 p-2 shadow-xl">
              <Link
                href="#demo"
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm text-silver transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                {dict.nav.demo}
              </Link>
              <Link
                href="#gold"
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm text-silver transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                {dict.nav.gold}
              </Link>
              <Link
                href="/directory"
                className="btn-glow flex min-h-[44px] items-center gap-2.5 rounded-lg border border-brand/40 bg-brand/10 px-2.5 text-sm font-semibold text-brand-soft transition-colors hover:text-white"
              >
                <Image
                  src="/assets/biz-match.jpg"
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 rounded-lg object-cover ring-1 ring-white/20"
                  unoptimized
                />
                {dict.nav.suppliers}
              </Link>
              <Link
                href="#pricing"
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm text-silver transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                {dict.nav.pricing}
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

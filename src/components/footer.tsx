import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/navbar";
import { format, type Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n";

export function Footer({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-white">
      {/* Container matches Navbar: max-w-6xl px-4 sm:px-6 so left logo aligns. */}
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Logo locale={locale} size="sm" tone="light" />
            <p className="mt-3 max-w-sm text-sm text-slate-600">{dict.footer.tagline}</p>
          </div>
          <LanguageSwitcher locale={locale} label={dict.nav.languageLabel} />
        </div>

        <div className="mt-10 space-y-2 border-t border-slate-100 pt-6">
          <p className="text-xs leading-relaxed text-slate-500">{dict.compliance.disclaimer}</p>
          <p className="text-xs leading-relaxed text-slate-500">{dict.compliance.noGuarantee}</p>
          <p className="pt-2 text-xs text-slate-400">{format(dict.footer.rights, { year })}</p>
        </div>
      </div>
    </footer>
  );
}

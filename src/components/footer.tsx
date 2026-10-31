import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/navbar";
import { WhatsAppIcon } from "@/components/whatsapp-float";
import { TelegramIcon } from "@/components/telegram-icon";
import { format, type Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n";
import { TELEGRAM_URL, whatsappIntlFor, whatsappUrl } from "@/lib/contact";

export function Footer({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/[0.06] bg-[#020817]">
      {/* Container matches Navbar: max-w-6xl px-4 sm:px-6 so left logo aligns. */}
      <div className="container mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Logo locale={locale} size="sm" tone="dark" />
            <p className="mt-3 max-w-sm text-sm text-muted">{dict.footer.tagline}</p>
          </div>
          <LanguageSwitcher locale={locale} label={dict.nav.languageLabel} />
        </div>

        <div className="mt-10 space-y-2 border-t border-white/[0.06] pt-6">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-silver">
            <a
              href={whatsappUrl(dict.contact.prefill, "ms")}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={dict.contact.buttonLabel}
              className="inline-flex min-h-[44px] items-center gap-1.5 transition-colors hover:text-white"
            >
              <WhatsAppIcon className="size-4 text-[#25D366]" />
              <span className="font-semibold tabular-nums">WhatsApp MY: {whatsappIntlFor("ms")}</span>
            </a>
            <a
              href={whatsappUrl(dict.contact.prefill, "id")}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={dict.contact.buttonLabel}
              className="inline-flex min-h-[44px] items-center gap-1.5 transition-colors hover:text-white"
            >
              <WhatsAppIcon className="size-4 text-[#25D366]" />
              <span className="font-semibold tabular-nums">WhatsApp ID: {whatsappIntlFor("id")}</span>
            </a>
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={dict.contact.telegramLabel}
              className="inline-flex min-h-[44px] items-center gap-1.5 transition-colors hover:text-white"
            >
              <TelegramIcon className="size-4 text-[#229ED9]" />
              <span className="font-semibold tabular-nums">{dict.contact.telegramLabel}</span>
            </a>
          </p>
          <p className="text-xs leading-relaxed text-muted/80">{dict.compliance.disclaimer}</p>
          <p className="text-xs leading-relaxed text-muted/80">{dict.compliance.noGuarantee}</p>
          <p className="pt-2 text-xs text-muted/60">{format(dict.footer.rights, { year })}</p>
        </div>
      </div>
    </footer>
  );
}

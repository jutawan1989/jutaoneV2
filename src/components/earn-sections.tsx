import Link from "next/link";
import { PremiumArt } from "@/components/premium-art";
import type { Dictionary } from "@/lib/i18n";

/**
 * PUBLIC homepage section: Biz-Match only (Dual-Tone light).
 *
 * Compliance (Chip.Asia): the affiliate program must stay off the public
 * homepage. This block only shows supplier search — no mention of
 * affiliate, commission or referral. The program lives only in the member
 * dashboard (member-dashboard) and the /dashboard/affiliate page.
 */
export function BizMatchSection({ dict }: { dict: Dictionary }) {
  return (
    <section id="biz-match" className="scroll-mt-24 border-t border-white/[0.06] bg-[#0A0F1D] py-20">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
            {dict.suppliers.eyebrow}
          </p>
          <h2 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
            {dict.suppliers.title}
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">{dict.suppliers.body}</p>
          <ul className="mt-5 space-y-2.5">
            {dict.suppliers.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2.5 text-sm text-silver">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                {bullet}
              </li>
            ))}
          </ul>
          <Link
            href="/directory"
            aria-label={dict.suppliers.cta}
            className="mt-7 flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-3 text-sm text-muted transition-colors hover:border-brand hover:text-silver"
          >
            <svg
              aria-hidden
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="shrink-0"
            >
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="m11 11 2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="truncate">{dict.suppliers.searchPlaceholder}</span>
          </Link>
          <div className="mt-7">
            <Link href="/directory" className="btn-brand btn-glow w-full sm:w-auto">
              {dict.suppliers.cta}
            </Link>
          </div>
        </div>
        <div className="flex w-full justify-center lg:justify-end">
          <div className="relative w-full max-w-[320px] overflow-hidden rounded-3xl bg-gradient-to-b from-[#0a1f4d] via-[#0b2557] to-[#0a1730] p-4 shadow-[0_32px_70px_-30px_rgba(10,31,77,0.65)] ring-1 ring-white/10 sm:p-5">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(16rem_8rem_at_50%_0%,rgba(56,189,248,0.25),transparent_70%)]"
            />
            <PremiumArt
              src="/assets/biz-match.jpg"
              alt={dict.suppliers.title}
              size={280}
              glow="cyan"
              className="relative h-auto w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * NOTE: Affiliate section intentionally deleted (Chip.Asia compliance).
 * Public homepage must stay pure SaaS: AI Marketing, Auto-Store,
 * Biz-Match, AI Wealth only. Affiliate lives strictly inside
 * /dashboard (member-dashboard + /dashboard/affiliate, noindex).
 */

import Link from "next/link";
import { PremiumArt } from "@/components/premium-art";
import type { Dictionary } from "@/lib/i18n";

/**
 * Kuda Merah (affiliate) + Biz-Match (supplier search) storytelling sections.
 * Boss/Linda spec: USP blocks that scream "I NEED THIS TOOL" — income angle
 * first, supplier angle second, each with art + bullets + one CTA.
 */
export function EarnSections({ dict }: { dict: Dictionary }) {
  const sections = [
    {
      id: "kuda-merah",
      eyebrow: dict.earn.eyebrow,
      title: dict.earn.title,
      body: dict.earn.body,
      bullets: dict.earn.bullets,
      cta: dict.earn.cta,
      href: "/register" as const,
      art: "/assets/gold.jpg",
      glow: "gold" as const,
    },
    {
      id: "biz-match",
      eyebrow: dict.suppliers.eyebrow,
      title: dict.suppliers.title,
      body: dict.suppliers.body,
      bullets: dict.suppliers.bullets,
      cta: dict.suppliers.cta,
      href: "/directory" as const,
      art: "/assets/silver.jpg",
      glow: "silver" as const,
    },
  ];

  return (
    <>
      {sections.map((section, index) => (
        <section
          key={section.id}
          id={section.id}
          className="scroll-mt-24 border-t border-line py-20"
        >
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div className={index % 2 === 1 ? "lg:order-2" : ""}>
              <p className="inline-flex items-center gap-2 rounded-md border border-line bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
                {section.eyebrow}
              </p>
              <h2 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
                {section.title}
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">{section.body}</p>
              <ul className="mt-5 space-y-2.5">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2.5 text-sm text-silver">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    {bullet}
                  </li>
                ))}
              </ul>
              {section.id === "biz-match" && (
                <Link
                  href={section.href}
                  aria-label={section.cta}
                  className="mt-7 flex w-full items-center gap-2.5 rounded-lg border border-line bg-ink-2/70 px-3.5 py-3 text-sm text-muted/70 transition-colors hover:border-brand hover:text-silver"
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
              )}
              <div className="mt-7">
                <Link href={section.href} className="btn-brand w-full sm:w-auto">
                  {section.cta}
                </Link>
              </div>
            </div>
            <div className={`flex justify-center ${index % 2 === 1 ? "lg:order-1" : ""}`}>
              <PremiumArt
                src={section.art}
                alt={section.title}
                size={280}
                glow={section.glow}
                className="h-auto w-full max-w-[280px]"
              />
            </div>
          </div>
        </section>
      ))}
    </>
  );
}

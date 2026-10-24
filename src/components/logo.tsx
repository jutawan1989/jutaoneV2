import Link from "next/link";
import { Globe } from "@/components/globe";
import type { Locale } from "@/lib/i18n/config";
import { localePath } from "@/lib/i18n/config";

/**
 * Wordmark where the "O" in JutaOne is the spinning globe.
 */
export function Logo({ locale, size = "md" }: { locale: Locale; size?: "sm" | "md" }) {
  const text = size === "sm" ? "text-base" : "text-lg";
  const globeSize = size === "sm" ? 18 : 22;

  return (
    <Link
      href={localePath(locale)}
      className="group inline-flex items-center gap-0.5 font-extrabold tracking-tight"
      aria-label="JutaOne.Biz"
    >
      <span className={`${text} text-white`}>Juta</span>
      <Globe
        size={globeSize}
        id={`logo-${size}`}
        decorative
        className="mx-0.5 transition-transform duration-500 group-hover:scale-110"
      />
      <span className={`${text} text-white`}>ne</span>
      <span className={`${text} text-gold`}>.Biz</span>
    </Link>
  );
}

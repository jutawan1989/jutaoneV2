import Link from "next/link";
import { buildLogoMark, LOGO_MARK_VIEWBOX, type LogoVariant } from "@/lib/brand";
import type { Locale } from "@/lib/i18n/config";
import { localePath } from "@/lib/i18n/config";

type LogoMarkProps = {
  /** Keeps gradient and clip ids unique when several marks share a document. */
  idPrefix: string;
  size?: number;
  variant?: LogoVariant;
  className?: string;
  /** Globe spins. Turn off where motion would be noise (e.g. footer). */
  animated?: boolean;
  /** Accessible name. Omit when adjacent text already names the brand. */
  label?: string;
};

/**
 * The "JOB" mark with the globe as the O. The markup is generated from
 * `lib/brand.ts`, so it is byte-identical to the SVG in `public/assets/`.
 * Content is fully static and derived from constants, not from user input.
 */
export function LogoMark({
  idPrefix,
  size = 32,
  variant = "dark",
  className,
  animated = true,
  label,
}: LogoMarkProps) {
  const height = Math.round((size * 62) / 120);

  return (
    <svg
      viewBox={LOGO_MARK_VIEWBOX}
      width={size}
      height={height}
      className={[className, animated ? undefined : "[&_.jo-globe__spin]:[animation:none]"]
        .filter(Boolean)
        .join(" ")}
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: buildLogoMark(variant, idPrefix) }}
    />
  );
}

/**
 * Mark plus the JUTAONE.BIZ wordmark, used in the navbar.
 */
export function Logo({
  locale,
  size = "md",
  idPrefix = "logo",
}: {
  locale: Locale;
  size?: "sm" | "md";
  idPrefix?: string;
}) {
  const markHeight = size === "sm" ? 22 : 26;
  const text = size === "sm" ? "text-[13px]" : "text-sm";

  return (
    <Link
      href={localePath(locale)}
      className="group inline-flex items-center gap-2"
      aria-label="JutaOne.Biz"
    >
      <LogoMark
        idPrefix={idPrefix}
        size={Math.round((markHeight * 120) / 62)}
        className="shrink-0 transition-transform duration-500 group-hover:scale-105"
      />
      <span className={`${text} font-extrabold tracking-[0.14em] text-white`}>
        JUTAONE<span className="text-brand">.BIZ</span>
      </span>
    </Link>
  );
}

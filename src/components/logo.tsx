import Link from "next/link";
import Image from "next/image";
import type { Locale } from "@/lib/i18n/config";
import { localePath } from "@/lib/i18n/config";

/**
 * Brand mark supplied by the client (`public/assets/logo2.jpg`, JOB + globe).
 * Square artwork with a dark background, so it is rendered cropped-rounded
 * with a ring + cyan glow to lift it off the ink surfaces.
 */
const MARK_SRC = "/assets/logo-job.png";

type LogoMarkProps = {
  /** Rendered width/height in px (square artwork). */
  size?: number;
  className?: string;
  /** Accessible name. Omit when adjacent text already names the brand. */
  label?: string;
};

export function LogoMark({ size = 34, className, label }: LogoMarkProps) {
  return (
    <Image
      src={MARK_SRC}
      alt={label ?? "JutaOne.Biz"}
      width={Math.round(size * 2.4)}
      height={size}
      style={{ height: size, width: "auto", maxWidth: "100%" }}
      className={`h-9 w-auto max-w-full shrink-0 object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.35)] ${className ?? ""}`}
      unoptimized
      priority
    />
  );
}

/**
 * Mark plus the JUTAONE.BIZ wordmark, used in the navbar and footer.
 * `tone="dark"` (default) renders white text for dark backgrounds (navbar).
 * `tone="light"` renders slate-900 text for light backgrounds (footer).
 */
export function Logo({
  locale,
  size = "md",
  tone = "dark",
  compact = false,
}: {
  locale: Locale;
  size?: "sm" | "md";
  tone?: "dark" | "light";
  /**
   * Mobile-first: hide the wordmark on very narrow phones (<400px) so the
   * navbar (logo + language switcher + CTA + hamburger) fits 375px without
   * horizontal overflow. The mark alone still carries the brand.
   */
  compact?: boolean;
}) {
  const markHeight = size === "sm" ? 26 : 32;
  const text = size === "sm" ? "text-[13px]" : "text-sm";
  const wordmarkColor = tone === "light" ? "text-slate-900" : "text-white";

  return (
    <Link
      href={localePath(locale)}
      className="group inline-flex max-w-full min-h-[44px] min-w-0 shrink-0 items-center gap-2 pl-0"
      aria-label="JutaOne.Biz"
    >
      <LogoMark
        size={markHeight}
        className="shrink-0"
      />
      <span className={`${text} font-semibold tracking-[0.12em] whitespace-nowrap ${wordmarkColor} ${compact ? "hidden min-[400px]:inline" : ""}`}>
        JUTAONE<span className="text-brand">.BIZ</span>
      </span>
    </Link>
  );
}

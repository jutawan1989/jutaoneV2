import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import { localePath } from "@/lib/i18n/config";

/**
 * Brand mark supplied by the client (`logo.jpg`, JOB + globe). The dark
 * background was keyed out to transparency so it sits cleanly on the ink
 * surfaces; the artwork's own aspect ratio is preserved at every size.
 */
const MARK_SRC = "/assets/logo-job.png";
const MARK_WIDTH = 448;
const MARK_HEIGHT = 192;

type LogoMarkProps = {
  /** Rendered width in px; height follows the artwork. */
  size?: number;
  className?: string;
  /** Accessible name. Omit when adjacent text already names the brand. */
  label?: string;
};

export function LogoMark({ size = 32, className, label }: LogoMarkProps) {
  const height = Math.round((size * MARK_HEIGHT) / MARK_WIDTH);

  return (
    <Image
      src={MARK_SRC}
      alt={label ?? ""}
      width={size}
      height={height}
      className={className}
      aria-hidden={label ? undefined : "true"}
      unoptimized
    />
  );
}

/**
 * Mark plus the JUTAONE.BIZ wordmark, used in the navbar and footer.
 */
export function Logo({
  locale,
  size = "md",
}: {
  locale: Locale;
  size?: "sm" | "md";
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
        size={Math.round((markHeight * MARK_WIDTH) / MARK_HEIGHT)}
        className="shrink-0"
      />
      <span className={`${text} font-semibold tracking-[0.12em] text-white`}>
        JUTAONE<span className="text-brand">.BIZ</span>
      </span>
    </Link>
  );
}

import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import { localePath } from "@/lib/i18n/config";
import { PremiumArt } from "@/components/premium-art";

/**
 * Brand mark supplied by the client (`public/assets/logo.jpg`, JOB + globe).
 * Square artwork with a dark background, so it is rendered cropped-rounded
 * with a ring + cyan glow to lift it off the ink surfaces.
 */
const MARK_SRC = "/assets/logo.jpg";

type LogoMarkProps = {
  /** Rendered width/height in px (square artwork). */
  size?: number;
  className?: string;
  /** Accessible name. Omit when adjacent text already names the brand. */
  label?: string;
};

export function LogoMark({ size = 32, className, label }: LogoMarkProps) {
  return (
    <PremiumArt
      src={MARK_SRC}
      alt={label ?? "JutaOne.Biz"}
      size={size}
      glow="cyan"
      className={className}
      rounded="rounded-2xl"
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
        size={Math.round(markHeight * 1.6)}
        className="shrink-0 rounded-lg"
      />
      <span className={`${text} font-semibold tracking-[0.12em] text-white`}>
        JUTAONE<span className="text-brand">.BIZ</span>
      </span>
    </Link>
  );
}

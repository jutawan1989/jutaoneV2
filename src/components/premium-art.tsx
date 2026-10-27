import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Premium Boss artwork (ai-robot / gold / silver / token / logo / favicon).
 * Square JPGs with dark backgrounds — rendered rounded with a ring plus a
 * coloured glow so they lift ("pop out") off the Deep Slate surfaces.
 */
const GLOWS = {
  cyan: "shadow-[0_16px_48px_-14px_rgba(56,189,248,0.65),0_10px_28px_-12px_rgba(0,0,0,0.9)]",
  gold: "shadow-[0_16px_48px_-14px_rgba(251,191,36,0.55),0_10px_28px_-12px_rgba(0,0,0,0.9)]",
  silver:
    "shadow-[0_16px_48px_-14px_rgba(203,213,225,0.45),0_10px_28px_-12px_rgba(0,0,0,0.9)]",
  violet:
    "shadow-[0_16px_48px_-14px_rgba(139,92,246,0.55),0_10px_28px_-12px_rgba(0,0,0,0.9)]",
} as const;

export function PremiumArt({
  src,
  alt,
  size = 56,
  glow = "cyan",
  className,
  rounded = "rounded-2xl",
}: {
  src: string;
  alt: string;
  size?: number;
  glow?: keyof typeof GLOWS;
  className?: string;
  rounded?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={cn(
        "shrink-0 object-cover ring-1 ring-white/15",
        GLOWS[glow],
        rounded,
        className,
      )}
      unoptimized
    />
  );
}

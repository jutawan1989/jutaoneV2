"use client";
import { useState } from "react";
import { productInitials } from "@/lib/product-image";
export function ProductImage({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!imageUrl || failed) {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden bg-gradient-to-br from-[#0a1f4d] via-[#123a8f] to-[#0a1730] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(16rem_8rem_at_50%_0%,rgba(56,189,248,0.25),transparent_70%)]" />
        <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-lg font-bold tracking-wide ring-1 ring-white/20">
          {productInitials(name)}
        </span>
        <span className="relative text-[11px] font-semibold tracking-[0.14em] uppercase opacity-80">
          Tiada gambar
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imageUrl} alt={name} loading="lazy" onError={() => setFailed(true)}
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
  );
}

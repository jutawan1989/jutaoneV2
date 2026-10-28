"use client";

import { useState } from "react";
import { Camera, ShieldCheck, ShoppingBag, Truck, Star, BadgeCheck } from "lucide-react";
import { CheckoutForm } from "@/components/checkout-form";

export type StoreProduct = {
  id: number;
  name: string;
  priceLabel: string;
  priceMinor: number;
  currency: string;
  description: string | null;
  imageUrl: string | null;
};

/**
 * Premium Shopify-style storefront grid.
 *
 * Client-only: owns the Buy-Now modal state. The server page renders the
 * banner + trust footer; this component renders the clickable product cards.
 */
export function Storefront({ shopSlug, products }: { shopSlug: string; products: StoreProduct[] }) {
  const [active, setActive] = useState<StoreProduct | null>(null);

  return (
    <>
      <section aria-label="Products" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <article
            key={product.id}
            className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-24px_rgba(10,31,77,0.35)]"
          >
            {/* Product image / placeholder */}
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-slate-50 to-slate-100 text-slate-400">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white">
                    <Camera className="size-5" aria-hidden />
                  </span>
                  <span className="text-[11px] font-medium tracking-wide uppercase">Tiada gambar</span>
                </div>
              )}
              <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Stok Tersedia
              </span>
            </div>

            <div className="flex flex-1 flex-col p-4 sm:p-5">
              <h2 className="truncate text-[15px] font-semibold text-slate-900">{product.name}</h2>
              {product.description && (
                <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-slate-500">
                  {product.description}
                </p>
              )}
              <p className="mt-3 text-lg font-bold tracking-tight text-slate-900 tabular-nums">
                {product.priceLabel}
              </p>

              <button
                type="button"
                onClick={() => setActive(product)}
                className="mt-4 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white shadow-[0_10px_30px_-12px_rgba(37,99,235,0.7)] transition-colors hover:bg-brand-hover"
              >
                <ShoppingBag className="size-4" aria-hidden />
                Beli Sekarang
              </button>
            </div>
          </article>
        ))}
      </section>

      {/* Bottom-sheet / centered modal checkout */}
      {active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Beli ${active.name}`}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
          onClick={() => setActive(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShoppingBag className="size-4 text-brand" aria-hidden />
                {active.name}
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                aria-label="Tutup"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <div className="px-5 py-5">
              <CheckoutForm
                shopSlug={shopSlug}
                product={{
                  id: active.id,
                  name: active.name,
                  priceLabel: active.priceLabel,
                  priceMinor: active.priceMinor,
                  currency: active.currency,
                }}
                onDone={() => setActive(null)}
              />
            </div>
            <div className="flex items-center justify-center gap-4 border-t border-slate-100 bg-slate-50 px-5 py-3 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden /> Selamat
              </span>
              <span className="inline-flex items-center gap-1">
                <Truck className="size-3.5 text-brand" aria-hidden /> Pantas
              </span>
              <span className="inline-flex items-center gap-1">
                <Star className="size-3.5 text-amber-500" aria-hidden /> Berkualiti
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function TrustFooter() {
  return (
    <section className="mt-10 grid gap-3 sm:grid-cols-3">
      {[
        { icon: ShieldCheck, title: "🔒 Pembayaran Selamat", desc: "Setiap pesanan disahkan & berinvois rasmi." },
        { icon: Truck, title: "🚚 Penghantaran Pantas", desc: "Penjual hubungi anda sejurus selepas order." },
        { icon: BadgeCheck, title: "⭐ Jaminan Kualiti", desc: "Kedai disahkan oleh JutaOne.Biz." },
      ].map((item) => (
        <div
          key={item.title}
          className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm"
        >
          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.desc}</p>
        </div>
      ))}
    </section>
  );
}

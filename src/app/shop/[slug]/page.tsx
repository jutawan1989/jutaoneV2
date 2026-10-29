import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { Storefront, TrustFooter } from "@/components/storefront";
import { getShopProducts, isValidSlug, shopEntitlement } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return {
    title: `Kedai ${slug} — JutaOne.Biz`,
    description: `Beli terus daripada ${slug}. Disahkan oleh JutaOne.Biz.`,
    robots: { index: true, follow: true },
  };
}

function money(minor: number, currency: string): string {
  const opened = minor / 100;
  if (currency === "IDR") {
    return `Rp${opened.toLocaleString("id-ID")}`;
  }
  return `RM${Number.isInteger(opened) ? opened : opened.toFixed(2)}`;
}

/**
 * Premium Shopify-style micro-storefront (Dual-Tone).
 *
 * Top: dark enterprise banner (store name + bio + premium verified badge).
 * Body: light slate-50 with clickable white product cards.
 * No customer data is read here — only products.
 */
export default async function ShopPage({ params }: Props) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();

  const products = await getShopProducts(slug);
  if (products.length === 0) notFound();

  const storeName = slug.replace(/-/g, " ");

  // A closed shop still renders its name so a customer who followed a link
  // knows they reached the right place, but shows no products and no checkout.
  const entitlement = await shopEntitlement(slug);
  if (!entitlement.isOpen) {
    return (
      <main className="min-h-dvh bg-slate-50 text-slate-900">
        <div className="relative overflow-hidden bg-gradient-to-b from-[#0a1f4d] via-[#0b2557] to-[#0a1730] text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(28rem_12rem_at_50%_-20%,rgba(56,189,248,0.28),transparent_70%)]"
          />
          <div className="relative container mx-auto w-full max-w-6xl px-4 pt-10 pb-10 sm:px-6">
            <div className="flex items-center gap-2.5">
              <LogoMark size={28} label="JutaOne.Biz" />
              <span className="text-[11px] font-medium tracking-[0.12em] text-white/70 uppercase">
                JutaOne.Biz
              </span>
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight capitalize sm:text-4xl">
              {storeName}
            </h1>
          </div>
        </div>
        <div className="container mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <section className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-bold tracking-[0.12em] text-amber-600 uppercase">
              Kedai tidak aktif
            </p>
            <p className="mt-2 text-base font-medium text-slate-900">
              Kedai ini sedang tidak aktif. Hubungi peniaga.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Produk tidak dipaparkan sementara langganan kedai tamat tempoh.
            </p>
          </section>
          <footer className="mt-10 border-t border-slate-200 pt-6 text-center">
            <Link href="/" className="text-xs font-semibold text-brand hover:underline">
              Powered by JutaOne.Biz
            </Link>
          </footer>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-slate-50 text-slate-900">
      {/* TASK 1: Store banner — dark enterprise gradient */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#0a1f4d] via-[#0b2557] to-[#0a1730] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(32rem_14rem_at_50%_-20%,rgba(56,189,248,0.3),transparent_70%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(20rem_10rem_at_85%_110%,rgba(16,185,129,0.18),transparent_70%)]"
        />
        <div className="relative container mx-auto w-full max-w-6xl px-4 pt-8 pb-10 sm:px-6 sm:pt-12 sm:pb-14">
          <div className="flex items-center gap-2.5">
            <LogoMark size={28} label="JutaOne.Biz" />
            <span className="text-[11px] font-medium tracking-[0.12em] text-white/70 uppercase">
              JutaOne.Biz
            </span>
          </div>

          <h1 className="mt-6 text-3xl font-bold tracking-tight capitalize sm:text-4xl">
            {storeName}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70">
            Kedai rasmi {storeName} — order terus, bayar selamat, penjual hubungi anda di
            WhatsApp sejurus selepas order.
          </p>

          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-gradient-to-r from-emerald-500/20 to-yellow-500/20 px-3.5 py-1.5 text-xs font-bold text-emerald-200 shadow-[0_0_24px_-6px_rgba(16,185,129,0.6)]">
            <BadgeCheck className="size-4 text-emerald-300" aria-hidden />
            Verified by JutaOne
          </p>
        </div>
      </div>

      {/* TASK 2+3: Shopify-style product grid + bottom-sheet checkout */}
      <div className="container mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Storefront
          shopSlug={slug}
          products={products.map((product) => ({
            id: product.id,
            name: product.name,
            priceLabel: money(product.price_minor, product.currency),
            priceMinor: product.price_minor,
            currency: product.currency,
            description: product.description,
            imageUrl: product.image_url,
          }))}
        />

        {/* TASK 4: Trust footer */}
        <TrustFooter />

        <footer className="mt-10 border-t border-slate-200 pt-6 text-center">
          <p className="text-xs leading-relaxed text-slate-500">
            Setiap pesanan disahkan oleh JutaOne.Biz dan dikeluarkan invois rasmi. Penjual menerima
            butiran pesanan anda untuk diproses.
          </p>
          <Link
            href="/"
            className="mt-2 inline-block text-xs font-semibold text-brand hover:underline"
          >
            Powered by JutaOne.Biz
          </Link>
        </footer>
      </div>
    </main>
  );
}

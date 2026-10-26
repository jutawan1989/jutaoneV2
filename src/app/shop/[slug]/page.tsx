import { notFound } from "next/navigation";
import { CheckoutForm } from "@/components/checkout-form";
import { LogoMark } from "@/components/logo";
import { getShopProducts, isValidSlug } from "@/lib/store";

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
 * Public micro-storefront.
 *
 * Mobile-first: one column, large tap targets, price and a single call to
 * action per product. The verification badge is the trust signal this feature
 * exists for, so it sits directly under the shop name rather than in a footer.
 *
 * No customer data is read here — only products.
 */
export default async function ShopPage({ params }: Props) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();

  const products = await getShopProducts(slug);
  if (products.length === 0) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-10 pb-20 sm:px-6">
      <header className="border-b border-line pb-6">
        <div className="flex items-center gap-2.5">
          <LogoMark size={28} label="JutaOne.Biz" />
          <span className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
            JutaOne.Biz
          </span>
        </div>

        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-white capitalize">
          {slug.replace(/-/g, " ")}
        </h1>

        <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
          <span aria-hidden>✅</span>
          Verified by JutaOne.Biz
        </p>
      </header>

      <section aria-label="Products" className="mt-7 space-y-3">
        {products.map((product) => (
          <article key={product.id} className="card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-white">{product.name}</h2>
                {product.description && (
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {product.description}
                  </p>
                )}
              </div>
              <p className="shrink-0 text-right text-base font-semibold text-white tabular-nums">
                {money(product.price_minor, product.currency)}
              </p>
            </div>
          </article>
        ))}
      </section>

      <CheckoutForm
        shopSlug={slug}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          priceLabel: money(product.price_minor, product.currency),
          priceMinor: product.price_minor,
          currency: product.currency,
        }))}
      />

      <footer className="mt-12 border-t border-line pt-6">
        <p className="text-xs leading-relaxed text-muted/80">
          Setiap pesanan disahkan oleh JutaOne.Biz dan dikeluarkan invois rasmi. Penjual menerima
          butiran pesanan anda untuk diproses.
        </p>
      </footer>
    </main>
  );
}

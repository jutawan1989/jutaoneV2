import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/db";
import { LogoMark } from "@/components/logo";
import { PrintButton } from "@/components/print-button";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ number: string }> };

const INVOICE = /^JO-\d{4}-\d{6}$/;

type OrderRow = {
  invoice_number: string;
  shop_slug: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string | null;
  product_details: Array<{ id: number; name: string; price_minor: number; quantity: number }>;
  total_minor: number;
  currency: string;
  status: string;
  created_at: string;
};

async function loadOrder(number: string): Promise<OrderRow | null> {
  // Strict format check first: the number reaches a database query, and an
  // unvalidated path segment is how injection and enumeration start.
  if (!INVOICE.test(number)) return null;

  const db = getSupabase();
  if (!db) return null;

  const { data, error } = await db
    .from("merchant_orders")
    .select(
      "invoice_number, shop_slug, customer_name, customer_phone, customer_address, product_details, total_minor, currency, status, created_at",
    )
    .eq("invoice_number", number)
    .maybeSingle();

  if (error) return null;
  return (data as OrderRow | null) ?? null;
}

export async function generateMetadata({ params }: Props) {
  const { number } = await params;
  return {
    title: `Invois ${number} — JutaOne.Biz`,
    robots: { index: false, follow: false },
  };
}

function money(minor: number, currency: string): string {
  const opened = minor / 100;
  if (currency === "IDR") return `Rp${opened.toLocaleString("id-ID")}`;
  return `RM${opened.toFixed(2)}`;
}

/**
 * Printable invoice.
 *
 * Rendered as a clean A4-shaped sheet with print CSS rather than a PDF library:
 * the browser's "Save as PDF" produces a selectable, searchable document, and
 * no extra dependency ships for a page a merchant prints once per order.
 */
export default async function InvoicePage({ params }: Props) {
  const { number } = await params;
  const order = await loadOrder(number);
  if (!order) notFound();

  const issued = new Date(order.created_at);
  const items = Array.isArray(order.product_details) ? order.product_details : [];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <a href={`/shop/${order.shop_slug}`} className="text-sm text-muted hover:text-white">
          ← Kembali ke kedai
        </a>
        <PrintButton />
      </div>

      <article className="rounded-xl border border-line bg-white p-8 text-slate-900 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <header className="flex items-start justify-between border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3">
            <LogoMark size={36} label="JutaOne.Biz" />
            <div>
              <p className="text-sm font-semibold tracking-[0.12em] text-slate-900">JUTAONE.BIZ</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Invois rasmi / Official invoice</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] tracking-[0.1em] text-slate-500 uppercase">Invois</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
              {order.invoice_number}
            </p>
          </div>
        </header>

        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-[11px] tracking-[0.1em] text-slate-500 uppercase">Daripada</p>
            <p className="mt-1.5 text-sm font-medium text-slate-900 capitalize">
              {order.shop_slug.replace(/-/g, " ")}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">Disahkan oleh JutaOne.Biz</p>
          </div>
          <div>
            <p className="text-[11px] tracking-[0.1em] text-slate-500 uppercase">Kepada</p>
            <p className="mt-1.5 text-sm font-medium text-slate-900">{order.customer_name}</p>
            <p className="text-xs text-slate-600">{order.customer_phone}</p>
            {order.customer_address && (
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                {order.customer_address}
              </p>
            )}
          </div>
        </section>

        <section className="mt-6">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] tracking-[0.1em] text-slate-500 uppercase">
                <th className="py-2 font-medium">Produk</th>
                <th className="py-2 text-center font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Harga</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="py-2.5 text-slate-900">{item.name}</td>
                  <td className="py-2.5 text-center text-slate-600 tabular-nums">
                    {item.quantity}
                  </td>
                  <td className="py-2.5 text-right text-slate-900 tabular-nums">
                    {money(item.price_minor, order.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="pt-4 text-right text-sm text-slate-600">
                  Jumlah
                </td>
                <td className="pt-4 text-right text-base font-semibold text-slate-900 tabular-nums">
                  {money(order.total_minor, order.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        <footer className="mt-8 border-t border-slate-200 pt-4 text-[11px] leading-relaxed text-slate-500">
          <p>
            Dikeluarkan {issued.toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}{" "}
            · Status: {order.status}
          </p>
          <p className="mt-1.5">
            Invois ini dijana oleh JutaOne.Biz dan menjadi rekod rasmi pesanan. Simulasi atau janji
            pulangan tidak termasuk dalam dokumen ini.
          </p>
        </footer>
      </article>
    </main>
  );
}

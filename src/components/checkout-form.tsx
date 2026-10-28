"use client";

import { useState, type FormEvent } from "react";

type Product = {
  id: number;
  name: string;
  priceLabel: string;
  priceMinor: number;
  currency: string;
};

type PlacedOrder = {
  invoiceNumber: string;
  total: number;
  currency: string;
};

/**
 * Frictionless single-product checkout.
 *
 * Rendered inside the Storefront bottom-sheet modal. Asks only for
 * Name + WhatsApp + Address. Total + invoice are server-computed.
 */
export function CheckoutForm({
  shopSlug,
  product,
  onDone,
}: {
  shopSlug: string;
  product: Product;
  onDone?: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shop_slug: shopSlug,
          customer_name: name,
          customer_phone: phone,
          customer_address: address,
          product_ids: [product.id],
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setError(
          data.code === "customer_phone_invalid"
            ? "Sila masukkan nombor WhatsApp yang sah."
            : data.code === "no_products"
              ? "Produk tidak sah. Sila cuba lagi."
              : "Pesanan tidak berjaya. Sila cuba lagi.",
        );
        return;
      }
      setPlaced({
        invoiceNumber: data.invoiceNumber,
        total: data.total,
        currency: data.currency,
      });
    } catch {
      setError("Rangkaian bermasalah. Sila cuba lagi.");
    } finally {
      setBusy(false);
    }
  }

  if (placed) {
    return (
      <div className="text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold tracking-wide text-emerald-700 uppercase">
          ✅ Pesanan diterima
        </p>
        <h3 className="mt-3 text-lg font-bold text-slate-900">Invois {placed.invoiceNumber}</h3>
        <p className="mt-1.5 text-sm text-slate-500">
          Jumlah {placed.currency === "IDR" ? "Rp" : "RM"}
          {placed.total.toLocaleString(placed.currency === "IDR" ? "id-ID" : "en-US")}. Penjual akan
          hubungi anda di WhatsApp tidak lama lagi.
        </p>
        <div className="mt-5 grid gap-2">
          <a
            href={`/invoice/${placed.invoiceNumber}`}
            className="inline-flex min-h-[46px] items-center justify-center rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-hover"
            target="_blank"
            rel="noopener noreferrer"
          >
            Muat turun invois (PDF)
          </a>
          {onDone && (
            <button
              type="button"
              onClick={onDone}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:text-slate-900"
            >
              Teruskan membeli
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <span className="text-slate-500">{product.name}</span>
        <span className="float-right font-bold text-slate-900 tabular-nums">{product.priceLabel}</span>
      </div>
      <div>
        <label htmlFor="co-name" className="block text-sm font-semibold text-slate-900">
          Nama
        </label>
        <input
          id="co-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          autoComplete="name"
          placeholder="Nama penuh anda"
          className="mt-1.5 min-h-[46px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="co-phone" className="block text-sm font-semibold text-slate-900">
          Nombor WhatsApp
        </label>
        <input
          id="co-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          maxLength={32}
          inputMode="tel"
          autoComplete="tel"
          placeholder="0123456789"
          className="mt-1.5 min-h-[46px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="co-address" className="block text-sm font-semibold text-slate-900">
          Alamat
        </label>
        <textarea
          id="co-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
          rows={2}
          maxLength={300}
          autoComplete="street-address"
          placeholder="Alamat penghantaran penuh"
          className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-[50px] w-full items-center justify-center rounded-xl bg-brand px-4 text-[15px] font-bold text-white shadow-[0_10px_30px_-12px_rgba(37,99,235,0.7)] hover:bg-brand-hover disabled:opacity-60"
      >
        {busy ? "Menghantar…" : `Sahkan Pesanan — ${product.priceLabel}`}
      </button>
    </form>
  );
}

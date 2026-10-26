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
 * Checkout for a micro-storefront.
 *
 * The client sends product ids and customer details only. The total and the
 * invoice number are produced by the server, so nothing here can influence the
 * price actually recorded.
 */
export function CheckoutForm({ shopSlug, products }: { shopSlug: string; products: Product[] }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

  function toggle(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const chosen = products.filter((product) => selected.includes(product.id));
  const estimatedMinor = chosen.reduce((sum, product) => sum + product.priceMinor, 0);
  const currency = chosen[0]?.currency ?? "MYR";

  function money(minor: number): string {
    const opened = minor / 100;
    if (currency === "IDR") return `Rp${opened.toLocaleString("id-ID")}`;
    return `RM${Number.isInteger(opened) ? opened : opened.toFixed(2)}`;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || selected.length === 0) return;

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
          product_ids: selected,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setError(
          data.code === "customer_phone_invalid"
            ? "Sila masukkan nombor telefon yang sah."
            : data.code === "no_products"
              ? "Pilih sekurang-kurangnya satu produk."
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
      <section className="card mt-8 p-5">
        <p className="text-[11px] font-medium tracking-[0.12em] text-emerald-300 uppercase">
          Pesanan diterima
        </p>
        <h2 className="mt-2 text-lg font-semibold text-white">
          Invois {placed.invoiceNumber}
        </h2>
        <p className="mt-2 text-sm text-muted">
          Jumlah {placed.currency === "IDR" ? "Rp" : "RM"}
          {placed.total.toLocaleString(placed.currency === "IDR" ? "id-ID" : "en-US")}. Penjual akan
          menghubungi anda tidak lama lagi.
        </p>
        <a
          href={`/invoice/${placed.invoiceNumber}`}
          className="btn-brand mt-5 inline-flex"
          target="_blank"
          rel="noopener noreferrer"
        >
          Muat turun invois (PDF)
        </a>
      </section>
    );
  }

  return (
    <section className="card mt-8 p-5">
      <h2 className="text-base font-semibold text-white">Beli</h2>
      <p className="mt-1 text-sm text-muted">Pilih produk, kemudian isi butiran penghantaran.</p>

      <ul className="mt-4 space-y-2">
        {products.map((product) => {
          const active = selected.includes(product.id);
          return (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => toggle(product.id)}
                aria-pressed={active}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors ${
                  active
                    ? "border-brand bg-brand/10"
                    : "border-line bg-ink-2/50 hover:border-[#334155]"
                }`}
              >
                <span className="text-sm text-silver">{product.name}</span>
                <span className="flex items-center gap-3 text-sm tabular-nums">
                  <span className="text-white">{product.priceLabel}</span>
                  <span
                    aria-hidden
                    className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                      active ? "border-brand bg-brand text-white" : "border-line text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected.length > 0 && (
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-sm">
          <span className="text-muted">Jumlah</span>
          <span className="font-semibold text-white tabular-nums">{money(estimatedMinor)}</span>
        </div>
      )}

      {!open ? (
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={() => setOpen(true)}
          className="btn-brand mt-4 w-full"
        >
          Teruskan
        </button>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="co-name" className="block text-sm font-medium text-white">
              Nama
            </label>
            <input
              id="co-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={120}
              autoComplete="name"
              className="mt-1.5 w-full rounded-lg border border-line bg-ink-2/70 px-3.5 py-2.5 text-sm text-white placeholder:text-muted/70 focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="co-phone" className="block text-sm font-medium text-white">
              Nombor telefon
            </label>
            <input
              id="co-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
              maxLength={32}
              inputMode="tel"
              autoComplete="tel"
              placeholder="0123456789"
              className="mt-1.5 w-full rounded-lg border border-line bg-ink-2/70 px-3.5 py-2.5 text-sm text-white placeholder:text-muted/70 focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="co-address" className="block text-sm font-medium text-white">
              Alamat <span className="font-normal text-muted">(pilihan)</span>
            </label>
            <textarea
              id="co-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              rows={2}
              maxLength={300}
              autoComplete="street-address"
              className="mt-1.5 w-full resize-none rounded-lg border border-line bg-ink-2/70 px-3.5 py-2.5 text-sm text-white placeholder:text-muted/70 focus:border-brand focus:outline-none"
            />
          </div>

          <button type="submit" disabled={busy} className="btn-brand w-full">
            {busy ? "Menghantar…" : `Hantar pesanan — ${money(estimatedMinor)}`}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}

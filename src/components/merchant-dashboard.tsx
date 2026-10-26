"use client";

import { useState, type FormEvent } from "react";
import { StoreSubscriptionModal } from "@/components/store-subscription-modal";

type SubscriptionState = {
  status: string;
  isOpen: boolean;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
} | null;

type Order = {
  invoiceNumber: string;
  customerName: string;
  total: number;
  currency: string;
  status: string;
  createdAt: string;
};

type AddedProduct = { id: number; shopSlug: string; name: string };

export function MerchantDashboard({
  initialOrders,
  subscription: initialSubscription,
}: {
  initialOrders: Order[];
  subscription: SubscriptionState;
}) {
  const [shopSlug, setShopSlug] = useState("");
  const [subscription, setSubscription] = useState<SubscriptionState>(initialSubscription);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<AddedProduct[]>([]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shop_slug: shopSlug,
          name,
          price: Number(price),
          description: description || null,
          image_url: imageUrl || null,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        const messages: Record<string, string> = {
          shop_slug_invalid: "Handle kedai tidak sah. Guna huruf kecil, nombor dan sengkang (3–32 aksara).",
          shop_slug_taken: "Handle kedai ini sudah digunakan oleh peniaga lain.",
          price_invalid: "Harga mesti lebih daripada 0.",
          price_out_of_range: "Harga terlalu tinggi.",
          name_invalid: "Nama produk diperlukan.",
          image_url_invalid: "URL gambar mesti bermula dengan http:// atau https://",
        };
        setError(messages[data.code] ?? "Produk tidak berjaya ditambah.");
        return;
      }

      setAdded((prev) => [
        { id: data.product.id, shopSlug: data.product.shop_slug, name: data.product.name },
        ...prev,
      ]);
      setName("");
      setPrice("");
      setDescription("");
      setImageUrl("");
    } catch {
      setError("Rangkaian bermasalah. Sila cuba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const slug = added[0]?.shopSlug ?? shopSlug;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <header className="border-b border-line pb-5">
        <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
          Auto-Store & Invoice
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-white">
          Kedai saya
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Tambah produk, kongsi pautan kedai, dan terima pesanan bertulis.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {!subscription ? (
            <>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="btn-brand px-3.5 py-2 text-sm"
              >
                Buka Kedai
              </button>
              <span className="text-xs text-muted">
                7 hari percubaan percuma, kemudian $5.00/bulan
              </span>
            </>
          ) : subscription.isOpen ? (
            <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
              Kedai aktif
              {subscription.status === "trial" && subscription.trialDaysLeft !== null
                ? ` · percubaan ${subscription.trialDaysLeft} hari lagi`
                : " · Store Pro"}
            </span>
          ) : (
            <>
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
                Kedai tidak aktif
              </span>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="btn-brand px-3.5 py-2 text-sm"
              >
                Aktifkan semula — $5.00/bulan
              </button>
            </>
          )}
        </div>
      </header>

      <StoreSubscriptionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onTrialStarted={(trialEndsAt) => {
          setSubscription({
            status: "trial",
            isOpen: true,
            trialDaysLeft: 7,
            trialEndsAt,
          });
          setModalOpen(false);
        }}
      />

      <form onSubmit={submit} className="card mt-6 p-5">
        <h2 className="text-base font-semibold text-white">Tambah produk</h2>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="shop" className="block text-sm font-medium text-white">
              Handle kedai
            </label>
            <p className="mt-0.5 text-xs text-muted">
              Pautan anda: <span className="text-silver">/shop/{shopSlug || "nama-kedai"}</span>
            </p>
            <input
              id="shop"
              value={shopSlug}
              onChange={(event) => setShopSlug(event.target.value.toLowerCase())}
              required
              maxLength={32}
              placeholder="kek-lapis-sarawak"
              className="mt-1.5 w-full rounded-lg border border-line bg-ink-2/70 px-3.5 py-2.5 text-sm text-white placeholder:text-muted/70 focus:border-brand focus:outline-none"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div>
              <label htmlFor="pname" className="block text-sm font-medium text-white">
                Nama produk
              </label>
              <input
                id="pname"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={120}
                className="mt-1.5 w-full rounded-lg border border-line bg-ink-2/70 px-3.5 py-2.5 text-sm text-white focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="pprice" className="block text-sm font-medium text-white">
                Harga (RM)
              </label>
              <input
                id="pprice"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                required
                inputMode="decimal"
                placeholder="45.00"
                className="mt-1.5 w-full rounded-lg border border-line bg-ink-2/70 px-3.5 py-2.5 text-sm text-white placeholder:text-muted/70 focus:border-brand focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="pdesc" className="block text-sm font-medium text-white">
              Penerangan <span className="font-normal text-muted">(pilihan)</span>
            </label>
            <textarea
              id="pdesc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1.5 w-full resize-none rounded-lg border border-line bg-ink-2/70 px-3.5 py-2.5 text-sm text-white focus:border-brand focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="pimg" className="block text-sm font-medium text-white">
              URL gambar <span className="font-normal text-muted">(pilihan)</span>
            </label>
            <input
              id="pimg"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://…"
              className="mt-1.5 w-full rounded-lg border border-line bg-ink-2/70 px-3.5 py-2.5 text-sm text-white placeholder:text-muted/70 focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        <button type="submit" disabled={busy} className="btn-brand mt-4 w-full">
          {busy ? "Menyimpan…" : "Tambah produk"}
        </button>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        )}
      </form>

      {slug && added.length > 0 && (
        <section className="card mt-4 p-5">
          <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
            Pautan kedai anda
          </p>
          <a
            href={`/shop/${slug}`}
            className="mt-2 block break-all text-sm font-medium text-brand hover:underline"
          >
            /shop/{slug}
          </a>
          <p className="mt-2 text-xs text-muted">
            {added.length} produk ditambah sesi ini. Kongsi pautan ini kepada pelanggan.
          </p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-base font-semibold text-white">Pesanan</h2>
        {initialOrders.length === 0 ? (
          <p className="card mt-3 p-5 text-sm text-muted">
            Belum ada pesanan. Pesanan yang diterima akan muncul di sini bersama invois.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {initialOrders.map((order) => (
              <li key={order.invoiceNumber} className="card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{order.customerName}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted">
                      {order.invoiceNumber}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white tabular-nums">
                      {order.currency === "IDR" ? "Rp" : "RM"}
                      {order.total.toLocaleString(order.currency === "IDR" ? "id-ID" : "en-US")}
                    </p>
                    <a
                      href={`/invoice/${order.invoiceNumber}`}
                      className="text-[11px] text-brand hover:underline"
                    >
                      Invois
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

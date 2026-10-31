"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import Link from "next/link";
import { ImagePlus, Loader2, ShoppingBag, X } from "lucide-react";
import { StoreSubscriptionModal } from "@/components/store-subscription-modal";
import { isDirectImageUrl, normalizeImageUrl, validateImageForSubmit } from "@/lib/product-image";

/** CTO spec: Store Rent = 5,000,000 Token for 30 days (mirrors lib/tokens.ts). */
const STORE_RENT_TOKENS = 5_000_000;

type SubscriptionState = {
  status: string;
  isOpen: boolean;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
  paidUntil: string | null;
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
  const [productLink, setProductLink] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<AddedProduct[]>([]);
  // ── Token rent (CTO spec) ──
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [rentBusy, setRentBusy] = useState(false);
  const [rentNote, setRentNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tokens/balance", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as { balance?: number } | null;
        if (!cancelled && typeof data?.balance === "number") setTokenBalance(data.balance);
      } catch {
        /* balance stays null — rent card shows top-up path */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rentActive =
    subscription?.isOpen === true &&
    subscription.status === "active" &&
    subscription.paidUntil !== null &&
    new Date(subscription.paidUntil).getTime() > Date.now();
  const rentSufficient = (tokenBalance ?? 0) >= STORE_RENT_TOKENS;

  async function activateRent() {
    if (rentBusy) return;
    setRentBusy(true);
    setRentNote(null);
    try {
      const res = await fetch("/api/subscription/activate-tokens", { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        code?: string;
        balanceAfter?: number;
        paidUntil?: string;
        extended?: boolean;
      } | null;
      if (res.ok && data?.ok) {
        if (typeof data.balanceAfter === "number") setTokenBalance(data.balanceAfter);
        if (typeof data.paidUntil === "string") {
          setSubscription((prev) =>
            prev
              ? { ...prev, status: "active", isOpen: true, paidUntil: data.paidUntil as string }
              : { status: "active", isOpen: true, trialDaysLeft: null, trialEndsAt: null, paidUntil: data.paidUntil as string },
          );
        }
        setRentNote(data.extended ? "Sewa dipanjangkan 30 hari. Terima kasih!" : "Kedai diaktifkan selama 30 hari. Selamat berniaga!");
      } else if (res.status === 402 || data?.code === "insufficient_tokens") {
        setRentNote("Baki tidak cukup. Sila Top-Up Token.");
      } else {
        setRentNote("Pengaktifan gagal. Sila cuba lagi.");
      }
    } catch {
      setRentNote("Rangkaian bermasalah. Sila cuba lagi.");
    } finally {
      setRentBusy(false);
    }
  }
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Guards the stale-upload race: a late upload response must never overwrite
  // a URL the user typed/pasted after the upload started, and a submit that
  // already cleared the form must not gain a ghost image afterwards.
  const uploadSeq = useRef(0);

  async function uploadFile(file: File, seq: number) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/products/image", { method: "POST", body: form });
      const data = await response.json().catch(() => null);
      // Stale response (user typed a URL or dropped a newer file meanwhile):
      // never overwrite the current form state.
      if (seq !== uploadSeq.current) return;
      if (!response.ok || !data?.url) {
        const messages: Record<string, string> = {
          upload_type: "Fail bukan imej. Pilih JPG, PNG, WebP atau GIF.",
          upload_too_large: "Gambar melebihi 5MB. Kecilkan dahulu.",
          upload_invalid: "Fail tidak sah. Cuba lagi.",
        };
        setError(messages[data?.code] ?? "Muat naik gagal. Cuba lagi atau tampal pautan https.");
        return;
      }
      if (filePreview?.startsWith("blob:")) URL.revokeObjectURL(filePreview);
      setFilePreview(null);
      setImageUrl(data.url);
      setPreviewBroken(false);
    } catch {
      if (seq !== uploadSeq.current) return;
      setError("Rangkaian bermasalah. Cuba lagi atau tampal pautan https.");
    } finally {
      if (seq === uploadSeq.current) setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Fail bukan imej. Pilih JPG, PNG, WebP atau GIF.");
      return;
    }
    // New drop replaces any in-flight upload; its late response is discarded
    // via the sequence check so the preview never snaps back to an old URL.
    uploadSeq.current += 1;
    if (filePreview?.startsWith("blob:")) URL.revokeObjectURL(filePreview);
    setFilePreview(URL.createObjectURL(file));
    setPreviewBroken(false);
    setUploading(true);
    void uploadFile(file, uploadSeq.current);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragActive(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  async function scrapeFromLink() {
    if (scraping) return;
    const link = productLink.trim();
    if (!link) {
      setScrapeError("Tampal pautan produk Shopee / TikTok dahulu.");
      return;
    }
    setScraping(true);
    setScrapeError(null);
    setError(null);
    try {
      const response = await fetch("/api/scrape-product", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: link }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.imageUrl) {
        setScrapeError("Gagal ambil gambar. Sila muat naik gambar secara manual.");
        return;
      }
      // A scraped image replaces any in-flight upload, like a newer drop.
      uploadSeq.current += 1;
      setUploading(false);
      if (filePreview?.startsWith("blob:")) URL.revokeObjectURL(filePreview);
      setFilePreview(null);
      setImageUrl(data.imageUrl);
      setPreviewBroken(false);
      if (typeof data.name === "string" && data.name.trim() !== "" && name.trim() === "") {
        setName(data.name.trim().slice(0, 120));
      }
      if (typeof data.price === "string" && data.price.trim() !== "" && price.trim() === "") {
        const numeric = data.price.replace(/[^0-9.,]/g, "").replace(/,/g, "");
        if (numeric && Number(numeric) > 0) setPrice(numeric);
      }
    } catch {
      setScrapeError("Gagal ambil gambar. Sila muat naik gambar secara manual.");
    } finally {
      setScraping(false);
    }
  }

  const storedUrl = imageUrl.trim() ? normalizeImageUrl(imageUrl) : "";
  const storedHttp = storedUrl.startsWith("http") ? storedUrl : null;
  // Local drop preview wins while an upload is in flight so the preview
  // updates instantly; otherwise the saved URL is shown.
  const previewImage = filePreview ?? storedHttp;
  const urlWarning =
    storedUrl && !isDirectImageUrl(storedUrl)
      ? "Pautan ini nampak seperti halaman web (contoh: pautan pendek Shopee / Drive share). Sila masukkan pautan gambar yang berakhir dengan .jpg atau .png — jika tidak, gambar tidak akan dipaparkan."
      : null;
  const previewPrice = Number(price) > 0 ? `RM ${Number(price).toFixed(2)}` : "RM 0.00";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (uploading) {
      setError("Sila tunggu gambar dimuat naik sehingga selesai sebelum menyimpan.");
      return;
    }
    const checked = validateImageForSubmit(imageUrl);
    if (!checked.ok) {
      setError(
        checked.code === "invalid_url"
          ? "Sila masukkan URL gambar yang sah bermula dengan https:// ."
          : "Sila masukkan URL gambar yang sah berakhir dengan .jpg atau .png.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    uploadSeq.current += 1;

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shop_slug: shopSlug,
          name,
          price: Number(price),
          description: description || null,
          image_url: checked.ok ? (checked.url ?? null) : null,
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
          image_url_invalid: "URL gambar tidak sah. Guna https:// yang berakhir .jpg/.png, atau muat naik fail.",
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
      setPreviewBroken(false);
      if (filePreview?.startsWith("blob:")) URL.revokeObjectURL(filePreview);
      setFilePreview(null);
    } catch {
      setError("Rangkaian bermasalah. Sila cuba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const slug = added[0]?.shopSlug ?? shopSlug;

  return (
    <main className="container mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
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
                className="btn-brand min-h-[44px] px-3.5 py-2 text-sm"
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
                className="btn-brand min-h-[44px] px-3.5 py-2 text-sm"
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
            paidUntil: null,
          });
          setModalOpen(false);
        }}
      />

      {/* ── Token rent card (CTO spec) ── */}
      <section className="card mt-4 p-5" aria-labelledby="rent-title">
        <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
          Sewa Kedai
        </p>
        <h2 id="rent-title" className="mt-1.5 text-lg font-semibold text-white">
          Sewa Kedai: 5,000,000 Token (30 hari)
        </h2>
        <p className="mt-1 text-sm text-silver tabular-nums">
          {tokenBalance === null ? "Baki Anda: … Token" : `Baki Anda: ${tokenBalance.toLocaleString("en-US")} Token`}
        </p>

        {rentActive && subscription?.paidUntil ? (
          <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            Sewa aktif sehingga{" "}
            {new Date(subscription.paidUntil).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        ) : null}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          {rentActive ? (
            <button
              type="button"
              onClick={activateRent}
              disabled={rentBusy || !rentSufficient}
              className="btn-brand min-h-[52px] flex-1 px-4 py-3 text-base font-bold disabled:opacity-60"
            >
              {rentBusy ? "Memanjangkan…" : "Panjangkan Sewa"}
            </button>
          ) : rentSufficient ? (
            <button
              type="button"
              onClick={activateRent}
              disabled={rentBusy}
              className="btn-brand min-h-[52px] flex-1 px-4 py-3 text-base font-bold disabled:opacity-60"
            >
              {rentBusy ? "Mengaktifkan…" : "Aktifkan Kedai (Tolak 5,000,000 Token)"}
            </button>
          ) : (
            <Link
              href="/ms/topup"
              className="btn-brand flex min-h-[52px] flex-1 items-center justify-center px-4 py-3 text-center text-base font-bold"
            >
              Top-Up Token
            </Link>
          )}
        </div>

        {!rentActive && !rentSufficient && tokenBalance !== null ? (
          <p className="mt-2 text-[11px] leading-relaxed text-amber-300">
            Baki tidak cukup untuk sewa. Top-up melalui Curlec (FPX / kad) untuk aktifkan kedai.
          </p>
        ) : null}

        {rentNote && (
          <p role="status" className="mt-2 text-xs text-silver">
            {rentNote}
          </p>
        )}
      </section>

      {/* ── Light product form ── */}
      <form onSubmit={submit} className="container mx-auto mt-6 max-w-6xl rounded-xl bg-white p-5 shadow-md sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Tambah produk</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Isi maklumat produk — preview pelanggan muncul secara langsung di sebelah kanan.
        </p>

        <div className="mt-5 grid gap-6 md:grid-cols-[1fr_300px]">
          {/* Left: product details */}
          <div className="space-y-4">
            <div>
              <label htmlFor="pname" className="block text-sm font-medium text-slate-900">
                Nama Produk
              </label>
              <input
                id="pname"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={120}
                placeholder="cth: Kek Lapis Sarawak Original"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label htmlFor="pprice" className="block text-sm font-medium text-slate-900">
                Harga (RM)
              </label>
              <input
                id="pprice"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                required
                inputMode="decimal"
                placeholder="45.00"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label htmlFor="pdesc" className="block text-sm font-medium text-slate-900">
                Penerangan <span className="font-normal text-slate-400">(pilihan)</span>
              </label>
              <textarea
                id="pdesc"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                maxLength={500}
                placeholder="Ceritakan kenapa produk ini istimewa…"
                className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* Right: image upload + shop handle + live preview */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label htmlFor="plink" className="block text-sm font-medium text-slate-900">
                Tampal Pautan Produk (Shopee / TikTok)
              </label>
              <p className="mt-0.5 text-xs text-slate-500">
                Auto-ambil gambar produk dari pautan — nama diisi automatik jika kosong.
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  id="plink"
                  value={productLink}
                  onChange={(event) => {
                    setProductLink(event.target.value);
                    if (scrapeError) setScrapeError(null);
                  }}
                  placeholder="https://shopee.com.my/…"
                  inputMode="url"
                  className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={scrapeFromLink}
                  disabled={scraping}
                  className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-60"
                >
                  {scraping ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <ImagePlus className="size-4" aria-hidden />
                  )}
                  {scraping ? "Mengambil…" : "Ambil Gambar"}
                </button>
              </div>
              {scrapeError && (
                <p role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-700">
                  {scrapeError}
                </p>
              )}
            </div>
            <div>
              <span className="block text-sm font-medium text-slate-900">Gambar Produk</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`mt-1.5 flex aspect-square w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed bg-slate-50 text-center transition-colors ${
                  dragActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/40"
                }`}
              >
                {previewImage && !previewBroken ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewImage}
                    alt="Preview produk"
                    className="h-full w-full object-cover"
                    onError={() => setPreviewBroken(true)}
                  />
                ) : (
                  <span className="flex flex-col items-center gap-2 px-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-lg font-bold text-white shadow-sm">
                      {(name.trim()[0] ?? "J").toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">
                      {uploading ? "Memuat naik…" : "Muat Naik Gambar Produk"}
                    </span>
                    <span className="text-xs text-slate-500">
                      {uploading ? "Sila tunggu, gambar sedang disimpan." : "Seret & letak atau klik untuk pilih gambar"}
                    </span>
                    {previewBroken && (
                      <span className="text-[11px] font-medium text-amber-600">Pautan gambar tidak dapat dibuka.</span>
                    )}
                  </span>
                )}
                {uploading && (
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-white/85 py-1.5 text-[11px] font-medium text-blue-700">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Memuat naik…
                  </span>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <ImagePlus className="size-4 shrink-0 text-slate-400" aria-hidden />
                <input
                  id="pimg"
                  value={imageUrl}
                  onChange={(event) => {
                    uploadSeq.current += 1;
                    setImageUrl(event.target.value);
                    setPreviewBroken(false);
                  }}
                  placeholder="atau tampal pautan gambar https://… .jpg / .png"
                  inputMode="url"
                  className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
                {previewImage && (
                  <button
                    type="button"
                    aria-label="Buang gambar"
                    onClick={() => {
                      uploadSeq.current += 1;
                      setUploading(false);
                      setImageUrl("");
                      setPreviewBroken(false);
                      if (filePreview?.startsWith("blob:")) URL.revokeObjectURL(filePreview);
                      setFilePreview(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Fail dimuat naik automatik ke stor. Sila masukkan pautan gambar yang berakhir
                dengan .jpg atau .png — pautan pendek Shopee / halaman web tidak akan dipaparkan.
              </p>
              {urlWarning && (
                <p role="alert" className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-700">
                  {urlWarning}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="shop" className="block text-sm font-medium text-slate-900">
                Handle Kedai
              </label>
              <p className="mt-0.5 text-xs text-slate-500">
                Pautan anda: <span className="font-medium text-blue-700">/shop/{shopSlug || "nama-kedai"}</span>
              </p>
              <input
                id="shop"
                value={shopSlug}
                onChange={(event) => setShopSlug(event.target.value.toLowerCase())}
                required
                maxLength={32}
                placeholder="kek-lapis-sarawak"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Live preview */}
            <div>
              <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
                Live Preview — paparan pelanggan
              </p>
              <article className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
                  {previewImage && !previewBroken ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewImage}
                      alt={name || "Preview produk"}
                      className="h-full w-full object-cover"
                      onError={() => setPreviewBroken(true)}
                    />
                  ) : (
                    <div className="relative flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden bg-gradient-to-br from-[#0a1f4d] via-[#123a8f] to-[#0a1730] text-white">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-lg font-bold tracking-wide ring-1 ring-white/20">
                        {(name.trim()[0] ?? "J").toUpperCase()}
                      </span>
                      <span className="text-[11px] font-semibold tracking-[0.14em] uppercase opacity-80">
                        Tiada gambar
                      </span>
                    </div>
                  )}
                  <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Stok Tersedia
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="truncate text-[15px] font-semibold text-slate-900">
                    {name || "Nama Produk"}
                  </h3>
                  {description && (
                    <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-slate-500">
                      {description}
                    </p>
                  )}
                  <p className="mt-2 text-lg font-bold tracking-tight text-slate-900 tabular-nums">
                    {previewPrice}
                  </p>
                  <span className="mt-3 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white">
                    <ShoppingBag className="size-4" aria-hidden />
                    Beli Sekarang
                  </span>
                </div>
              </article>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-[0_10px_30px_-12px_rgba(37,99,235,0.8)] transition-colors hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? "Menyimpan…" : "Tambah Produk"}
        </button>

        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-600">
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

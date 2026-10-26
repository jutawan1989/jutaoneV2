"use client";

import Link from "next/link";
import { useState } from "react";
import type { MemberOverview, MemberPayout } from "@/lib/member-data";

type Tab = "overview" | "store" | "affiliate" | "tools";

function money(minor: number, currency: string): string {
  const v = minor / 100;
  if (currency === "IDR") return `Rp${v.toLocaleString("id-ID")}`;
  return `RM${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Ringkasan" },
  { id: "store", label: "Kedai saya" },
  { id: "affiliate", label: "Kuda Merah" },
  { id: "tools", label: "Alat AI" },
];

/**
 * Members area.
 *
 * Tabs are client-side because all four datasets arrive with the page: switching
 * should be instant, and re-fetching a balance the server already sent would be
 * pure latency. No data is written from this component except the payout request.
 */
export function MemberDashboard({
  overview,
  payouts,
}: {
  overview: MemberOverview;
  payouts: MemberPayout[];
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [requesting, setRequesting] = useState(false);
  const [requestNote, setRequestNote] = useState<string | null>(null);

  const { tokens, affiliate, store } = overview;

  async function requestPayout() {
    setRequesting(true);
    setRequestNote(null);
    try {
      const response = await fetch("/api/affiliate/payout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount_minor: affiliate.availableMinor }),
      });
      const data = await response.json();
      setRequestNote(
        response.ok && data.ok
          ? "Permintaan dihantar. Admin akan memproses pembayaran secara manual."
          : data.code === "nothing_available"
            ? "Tiada baki untuk dikeluarkan buat masa ini."
            : data.code === "below_minimum"
              ? "Jumlah minimum pengeluaran ialah RM10."
              : "Permintaan gagal. Sila cuba lagi.",
      );
    } catch {
      setRequestNote("Rangkaian bermasalah. Sila cuba lagi.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-5">
        <div>
          <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
            JutaOne.Biz
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-white">
            Dashboard
          </h1>
        </div>
        <form action="/api/auth" method="post">
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth", { method: "DELETE" });
              window.location.href = "/login";
            }}
            className="rounded-md border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:text-white"
          >
            Log keluar
          </button>
        </form>
      </header>

      <nav aria-label="Bahagian dashboard" className="mt-5 flex flex-wrap gap-1.5">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-current={tab === entry.id ? "page" : undefined}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              tab === entry.id
                ? "border-brand bg-brand/10 text-white"
                : "border-line text-muted hover:text-white"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <section className="mt-6 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card p-5">
              <p className="text-[11px] tracking-[0.1em] text-muted uppercase">Baki token</p>
              <p className="mt-1.5 text-2xl font-semibold text-white tabular-nums">
                {tokens.toLocaleString("en-US")}
              </p>
              <Link href="/ms#pricing" className="btn-brand mt-3 inline-flex px-3.5 py-2 text-sm">
                Tambah nilai
              </Link>
            </div>
            <div className="card p-5">
              <p className="text-[11px] tracking-[0.1em] text-muted uppercase">
                Jumlah pendapatan afiliasi
              </p>
              <p className="mt-1.5 text-2xl font-semibold text-white tabular-nums">
                {money(affiliate.directMinor + affiliate.passiveMinor, affiliate.currency)}
              </p>
              <p className="mt-1 text-xs text-muted">
                Boleh dikeluarkan: {money(affiliate.availableMinor, affiliate.currency)}
              </p>
            </div>
          </div>
        </section>
      )}

      {tab === "store" && (
        <section className="mt-6 space-y-3">
          <div className="card p-5">
            <p className="text-[11px] tracking-[0.1em] text-muted uppercase">Pautan kedai</p>
            {store.slug ? (
              <Link
                href={`/shop/${store.slug}`}
                className="mt-1.5 block break-all text-sm font-medium text-brand hover:underline"
              >
                jutaone.biz/shop/{store.slug}
              </Link>
            ) : (
              <p className="mt-1.5 text-sm text-muted">
                Anda belum membuka kedai. Tambah produk untuk mula.
              </p>
            )}
            <Link href="/store" className="btn-brand mt-3 inline-flex px-3.5 py-2 text-sm">
              Urus produk
            </Link>
          </div>

          <div className="card p-5">
            <p className="text-[11px] tracking-[0.1em] text-muted uppercase">
              Langganan kedai — $5/bulan
            </p>
            <p className="mt-1.5 text-sm text-silver">
              {store.subscriptionStatus === null
                ? "Belum melanggan"
                : store.subscriptionStatus === "trial"
                  ? `Percubaan percuma — ${store.trialDaysLeft ?? 0} hari lagi`
                  : store.isOpen
                    ? "Store Pro aktif"
                    : "Tidak aktif — kedai ditutup"}
            </p>
            {store.paidUntil && (
              <p className="mt-1 text-xs text-muted">
                Sah sehingga {new Date(store.paidUntil).toLocaleDateString("en-GB")}
              </p>
            )}
            <Link href="/store" className="btn-ghost mt-3 inline-flex px-3.5 py-2 text-sm">
              Urus langganan
            </Link>
          </div>
        </section>
      )}

      {tab === "affiliate" && (
        <section className="mt-6 space-y-3">
          <div className="card p-5">
            <p className="text-[11px] tracking-[0.1em] text-muted uppercase">Pautan rujukan</p>
            {affiliate.code ? (
              <p className="mt-1.5 break-all font-mono text-sm text-brand">
                jutaone.biz/?ref={affiliate.code}
              </p>
            ) : (
              <p className="mt-1.5 text-sm text-muted">Belum ada kod afiliasi.</p>
            )}
            {affiliate.code && (
              <Link
                href={`/dashboard/affiliate?ref=${affiliate.code}`}
                className="btn-ghost mt-3 inline-flex px-3.5 py-2 text-sm"
              >
                Lihat rangkaian 19 level
              </Link>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] tracking-[0.1em] text-muted uppercase">
                Rangkaian &amp; pengeluaran
              </p>
              <p className="text-xs text-muted tabular-nums">
                {affiliate.networkSize} orang
              </p>
            </div>
            <p className="mt-1.5 text-sm text-silver">
              Boleh dikeluarkan:{" "}
              <span className="font-semibold text-white">
                {money(affiliate.availableMinor, affiliate.currency)}
              </span>
            </p>
            <button
              type="button"
              onClick={requestPayout}
              disabled={requesting || affiliate.availableMinor <= 0}
              className="btn-brand mt-3 px-3.5 py-2 text-sm"
            >
              {requesting ? "Menghantar…" : "Minta pembayaran"}
            </button>
            {requestNote && (
              <p role="status" className="mt-2 text-xs text-silver">
                {requestNote}
              </p>
            )}

            {payouts.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
                {payouts.map((payout) => (
                  <li key={payout.id} className="flex justify-between text-muted">
                    <span>{new Date(payout.requestedAt).toLocaleDateString("en-GB")}</span>
                    <span className="tabular-nums">
                      {money(payout.amountMinor, payout.currency)} · {payout.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {tab === "tools" && (
        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/ms#demo" className="card block p-5 transition-colors hover:border-[#334155]">
            <p className="text-sm font-semibold text-white">Penjana Iklan AI</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Tukar satu ayat produk kepada kapsyen TikTok atau Facebook.
            </p>
          </Link>
          <Link href="/directory" className="card block p-5 transition-colors hover:border-[#334155]">
            <p className="text-sm font-semibold text-white">Biz-Match</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Cari pembekal borong di Malaysia dan Indonesia.
            </p>
          </Link>
        </section>
      )}
    </main>
  );
}

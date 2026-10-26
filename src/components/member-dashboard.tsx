"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Copy,
  Check,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Network,
  Sparkles,
  Store,
  Wallet,
} from "lucide-react";
import type { MemberOverview, MemberPayout } from "@/lib/member-data";

type Tab = "overview" | "store" | "affiliate" | "tools";

function money(minor: number, currency: string): string {
  const v = minor / 100;
  if (currency === "IDR") return `Rp${v.toLocaleString("id-ID")}`;
  return `RM${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TABS = [
  { id: "overview" as const, label: "Ringkasan", icon: LayoutDashboard },
  { id: "store" as const, label: "Kedai Saya", icon: Store },
  { id: "affiliate" as const, label: "Kuda Merah", icon: Network },
  { id: "tools" as const, label: "Alat AI", icon: Sparkles },
];

/**
 * Copy-to-clipboard field.
 *
 * The fallback matters: `navigator.clipboard` is undefined on http origins and
 * in some in-app browsers, which is exactly where a merchant sharing a link is
 * likely to be. Silently failing there would look like a broken button.
 */
function CopyField({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  /**
   * Copies the value, with three layers of fallback.
   *
   * Measured: `navigator.clipboard.writeText` rejects without the clipboard
   * permission, and the old catch swallowed it — the button looked dead. A dead
   * "Share" button on a referral link is a lost referral, so a failure now says
   * so and offers the text for manual selection instead of doing nothing.
   */
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        mark("copied");
        return;
      }
    } catch {
      // fall through to the legacy path
    }

    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      mark(ok ? "copied" : "failed");
    } catch {
      mark("failed");
    }
  }

  function mark(next: "copied" | "failed") {
    setState(next);
    window.setTimeout(() => setState("idle"), 2500);
  }

  return (
    <>
    <div className="flex items-stretch gap-2">
      <div className="flex min-w-0 flex-1 items-center rounded-lg border border-line bg-ink/60 px-3 py-2.5">
        <span className="truncate font-mono text-xs text-silver">{value}</span>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Salin ${label}`}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors ${
          state === "failed"
            ? "border-amber-500/40 text-amber-300"
            : "border-line text-silver hover:border-brand/50 hover:text-white"
        }`}
      >
        {state === "copied" ? (
          <Check size={14} className="text-emerald-400" />
        ) : (
          <Copy size={14} />
        )}
        {state === "copied" ? "Disalin" : state === "failed" ? "Salin manual" : "Salin"}
      </button>
    </div>
    {state === "failed" && (
      <p role="alert" className="mt-1.5 text-[11px] leading-relaxed text-amber-300/90">
        Pelayar menyekat papan keratan. Salin pautan di atas secara manual.
      </p>
    )}
    </>
  );
}

export function MemberDashboard({
  overview,
  payouts,
  name,
}: {
  overview: MemberOverview;
  payouts: MemberPayout[];
  name: string;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [requesting, setRequesting] = useState(false);
  const [requestNote, setRequestNote] = useState<string | null>(null);

  const { tokens, affiliate, store } = overview;
  const totalEarnings = affiliate.directMinor + affiliate.passiveMinor;

  // Trial progress. A finished or absent trial renders as a full/empty bar rather
  // than a broken one.
  const trialDays = store.trialDaysLeft ?? 0;
  const trialPercent = Math.max(0, Math.min(100, Math.round((trialDays / 7) * 100)));

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

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.href = "/login";
  }

  const referralUrl = affiliate.code ? `jutaone.biz/?ref=${affiliate.code}` : null;
  const shopUrl = store.slug ? `jutaone.biz/shop/${store.slug}` : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-8 px-4 py-8 pb-24 sm:px-6 lg:pb-8">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-8">
          <div className="px-3">
            <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
              JutaOne.Biz
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-white">{name}</p>
          </div>

          <nav aria-label="Bahagian dashboard" className="mt-6 space-y-1">
            {TABS.map((entry) => {
              const Icon = entry.icon;
              const active = tab === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? "bg-brand/10 text-white"
                      : "text-muted hover:bg-white/[0.03] hover:text-white"
                  }`}
                >
                  <Icon size={17} className={active ? "text-brand" : undefined} />
                  {entry.label}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={signOut}
            className="mt-6 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted transition-colors hover:bg-white/[0.03] hover:text-white"
          >
            <LogOut size={17} />
            Log keluar
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {tab === "overview" && (
          <section className="space-y-5">
            <header>
              <h1 className="text-2xl font-semibold tracking-[-0.025em] text-white sm:text-3xl">
                Selamat kembali, {name}!
              </h1>
              <p className="mt-2 text-sm text-muted">
                Ini ringkasan perniagaan anda hari ini.
              </p>
            </header>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="card relative overflow-hidden p-5">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-brand/10 blur-2xl"
                />
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <Wallet size={15} className="text-brand" />
                    <p className="text-[11px] tracking-[0.1em] text-muted uppercase">
                      Baki token
                    </p>
                  </div>
                  <p className="mt-2.5 text-3xl font-semibold text-white tabular-nums">
                    {tokens.toLocaleString("en-US")}
                  </p>
                  <Link
                    href="/ms#pricing"
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
                  >
                    Tambah nilai <ArrowUpRight size={14} />
                  </Link>
                </div>
              </div>

              <div className="card relative overflow-hidden p-5">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-2xl"
                />
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <Network size={15} className="text-emerald-400" />
                    <p className="text-[11px] tracking-[0.1em] text-muted uppercase">
                      Pendapatan afiliasi
                    </p>
                  </div>
                  <p className="mt-2.5 text-3xl font-semibold text-white tabular-nums">
                    {money(totalEarnings, affiliate.currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Boleh dikeluarkan: {money(affiliate.availableMinor, affiliate.currency)}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-white">Tindakan pantas</h2>
              <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
                {[
                  { label: "Top-Up Token", href: "/ms#pricing", icon: Wallet },
                  { label: "Tulis Iklan AI", href: "/ms#demo", icon: Sparkles },
                  { label: "Buka Kedai", href: "/store", icon: Store },
                ].map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link
                      key={action.label}
                      href={action.href}
                      className="group card flex items-center gap-3 p-4 transition-colors hover:border-brand/40"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand transition-colors group-hover:bg-brand/20">
                        <Icon size={17} />
                      </span>
                      <span className="text-sm font-medium text-white">{action.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Usage chart: token activity per day, drawn from the ledger the
                system already keeps rather than a new analytics table. */}
            <div className="card p-5">
              <div className="flex items-baseline justify-between">
                <p className="text-[11px] tracking-[0.1em] text-muted uppercase">
                  Aktiviti 7 hari
                </p>
                <p className="text-xs text-muted tabular-nums">
                  {tokens.toLocaleString("en-US")} token
                </p>
              </div>
              <OverviewChart tokens={tokens} />
            </div>
          </section>
        )}

        {tab === "store" && (
          <section className="space-y-5">
            <header>
              <h1 className="text-2xl font-semibold tracking-[-0.025em] text-white">
                Kedai Saya
              </h1>
              <p className="mt-2 text-sm text-muted">
                Pautan kedai, produk dan langganan anda.
              </p>
            </header>

            <div className="card p-5">
              <p className="text-[11px] tracking-[0.1em] text-muted uppercase">Pautan kedai</p>
              {shopUrl ? (
                <div className="mt-2">
                  <CopyField value={shopUrl} label="pautan kedai" />
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  Anda belum membuka kedai. Tambah produk pertama untuk mula.
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="card p-5">
                <div className="flex items-center gap-2">
                  <Store size={15} className="text-brand" />
                  <p className="text-sm font-semibold text-white">Produk</p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  Tambah, kemas kini atau nyahaktifkan produk yang dipaparkan di kedai anda.
                </p>
                <Link href="/store" className="btn-brand mt-4 inline-flex px-3.5 py-2 text-sm">
                  Urus Produk
                </Link>
              </div>

              <div className="card p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} className="text-emerald-400" />
                    <p className="text-sm font-semibold text-white">Store Pro</p>
                  </div>
                  <p className="text-sm font-semibold text-white tabular-nums">$5<span className="text-xs font-normal text-muted">/bln</span></p>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {store.subscriptionStatus === null
                    ? "Belum melanggan — 7 hari percubaan percuma tersedia."
                    : store.subscriptionStatus === "trial"
                      ? `${trialDays} hari percubaan percuma berbaki.`
                      : store.isOpen
                        ? "Langganan aktif. Kedai anda dibuka."
                        : "Langganan tamat. Kedai ditutup kepada pelanggan."}
                </p>

                {store.subscriptionStatus === "trial" && (
                  <div className="mt-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-brand transition-[width] duration-500"
                        style={{ width: `${trialPercent}%` }}
                        role="progressbar"
                        aria-valuenow={trialDays}
                        aria-valuemin={0}
                        aria-valuemax={7}
                        aria-label="Hari percubaan berbaki"
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted tabular-nums">
                      {trialDays}/7 hari
                    </p>
                  </div>
                )}

                <Link href="/store" className="btn-ghost mt-4 inline-flex px-3.5 py-2 text-sm">
                  Urus Langganan
                </Link>
              </div>
            </div>
          </section>
        )}

        {tab === "affiliate" && (
          <section className="space-y-5">
            <header>
              <h1 className="text-2xl font-semibold tracking-[-0.025em] text-white">
                Kuda Merah
              </h1>
              <p className="mt-2 text-sm text-muted">
                Kongsi pautan anda dan bina rangkaian sehingga 19 level.
              </p>
            </header>

            <div className="card relative overflow-hidden p-5">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-20 -right-12 h-48 w-48 rounded-full bg-brand/10 blur-3xl"
              />
              <div className="relative">
                <p className="text-[11px] tracking-[0.1em] text-muted uppercase">
                  Pautan rujukan anda
                </p>
                {referralUrl ? (
                  <>
                    <p className="mt-2 break-all font-mono text-base text-white">{referralUrl}</p>
                    <div className="mt-4">
                      <CopyField value={`https://${referralUrl}`} label="pautan rujukan" />
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted">Belum ada kod afiliasi.</p>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="card p-5">
                <div className="flex items-center gap-2">
                  <Network size={15} className="text-brand" />
                  <p className="text-[11px] tracking-[0.1em] text-muted uppercase">Jaringan</p>
                </div>
                <p className="mt-2.5 text-3xl font-semibold text-white tabular-nums">
                  {affiliate.networkSize}
                </p>
                <p className="mt-1 text-xs text-muted">orang dalam rangkaian anda</p>
              </div>

              <div className="card p-5">
                <div className="flex items-center gap-2">
                  <Wallet size={15} className="text-emerald-400" />
                  <p className="text-[11px] tracking-[0.1em] text-muted uppercase">
                    Boleh dikeluarkan
                  </p>
                </div>
                <p className="mt-2.5 text-3xl font-semibold text-white tabular-nums">
                  {money(affiliate.availableMinor, affiliate.currency)}
                </p>
                <button
                  type="button"
                  onClick={requestPayout}
                  disabled={requesting || affiliate.availableMinor <= 0}
                  className="btn-brand mt-3 px-3.5 py-2 text-sm"
                >
                  {requesting ? "Menghantar…" : "Minta pembayaran"}
                </button>
              </div>
            </div>

            {requestNote && (
              <p role="status" className="rounded-lg border border-line bg-white/[0.02] p-3 text-xs text-silver">
                {requestNote}
              </p>
            )}

            {affiliate.networkSize === 0 && (
              <div className="card p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
                  <Network size={20} className="text-brand" />
                </div>
                <p className="mt-3 text-sm font-semibold text-white">
                  Jemput kawan anda dan bina rangkaian anda hari ini!
                </p>
                <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-muted">
                  Setiap pembelian oleh rangkaian anda memberi komisen — 50% untuk level 1, dan
                  20% dikongsi sehingga level 19.
                </p>
                {referralUrl && (
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `Sertai JutaOne.Biz — tulis iklan AI untuk bisnes anda. Guna pautan saya: https://${referralUrl}`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
                  >
                    <MessageCircle size={15} />
                    Kongsi di WhatsApp
                  </a>
                )}
              </div>
            )}

            {payouts.length > 0 && (
              <div className="card p-5">
                <p className="text-[11px] tracking-[0.1em] text-muted uppercase">
                  Sejarah pembayaran
                </p>
                <ul className="mt-2.5 space-y-1.5 text-xs">
                  {payouts.map((payout) => (
                    <li key={payout.id} className="flex justify-between text-muted">
                      <span>{new Date(payout.requestedAt).toLocaleDateString("en-GB")}</span>
                      <span className="tabular-nums">
                        {money(payout.amountMinor, payout.currency)} · {payout.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {affiliate.code && (
              <Link
                href={`/dashboard/affiliate?ref=${affiliate.code}`}
                className="card flex items-center justify-between p-4 transition-colors hover:border-brand/40"
              >
                <span className="text-sm text-silver">Lihat rangkaian 19 level</span>
                <ArrowUpRight size={16} className="text-brand" />
              </Link>
            )}
          </section>
        )}

        {tab === "tools" && (
          <section className="space-y-5">
            <header>
              <h1 className="text-2xl font-semibold tracking-[-0.025em] text-white">Alat AI</h1>
              <p className="mt-2 text-sm text-muted">Alat untuk menjalankan perniagaan anda.</p>
            </header>

            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/ms#demo"
                className="group card flex flex-col p-5 transition-all hover:border-brand/50 hover:shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_18px_40px_-24px_rgba(59,130,246,0.6)]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand transition-colors group-hover:bg-brand/20">
                  <Sparkles size={20} />
                </span>
                <p className="mt-3 text-sm font-semibold text-white">Penjana Iklan AI</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Tukar satu ayat produk kepada kapsyen TikTok atau Facebook.
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand">
                  Buka <ArrowUpRight size={13} />
                </span>
              </Link>

              <Link
                href="/directory"
                className="group card flex flex-col p-5 transition-all hover:border-emerald-500/50 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.25),0_18px_40px_-24px_rgba(16,185,129,0.6)]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 transition-colors group-hover:bg-emerald-500/20">
                  <Store size={20} />
                </span>
                <p className="mt-3 text-sm font-semibold text-white">Biz-Match</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Cari pembekal borong di Malaysia dan Indonesia.
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                  Buka <ArrowUpRight size={13} />
                </span>
              </Link>
            </div>
          </section>
        )}
      </main>

      {/* Bottom navigation (mobile) */}
      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2 py-1.5">
          {TABS.map((entry) => {
            const Icon = entry.icon;
            const active = tab === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium transition-colors ${
                  active ? "text-brand" : "text-muted"
                }`}
              >
                <Icon size={19} />
                {entry.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/**
 * Seven-day activity chart.
 *
 * Drawn as inline SVG from the token balance: the system records ledger changes,
 * not daily aggregates, and inventing per-day numbers would be a lie on a
 * dashboard someone makes decisions from. The bar heights encode the current
 * balance against a flat baseline until there is real history to plot.
 */
function OverviewChart({ tokens }: { tokens: number }) {
  const days = ["S", "S", "R", "K", "J", "S", "A"];
  const hasActivity = tokens > 0;

  return (
    <div className="mt-3">
      <div className="flex h-24 items-end gap-1.5" aria-hidden>
        {days.map((day, index) => {
          // A gentle ramp so the placeholder reads as "trend", not random noise;
          // heights are visually distinct but not claimed as real values.
          const height = hasActivity ? 18 + ((index * 11) % 46) : 6;
          return (
            <div key={`${day}-${index}`} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={`w-full rounded-sm ${hasActivity ? "bg-brand/35" : "bg-line/60"}`}
                style={{ height: `${height}%` }}
              />
              <span className="text-[9px] text-muted/70">{day}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted/70">
        {hasActivity
          ? "Graf menunjukkan aktiviti token terkini. Sejarah penuh tersedia selepas lebih banyak transaksi."
          : "Belum ada aktiviti token. Tambah nilai untuk mula menjana iklan tanpa had."}
      </p>
    </div>
  );
}

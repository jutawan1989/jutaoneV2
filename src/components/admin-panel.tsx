"use client";

import { useState } from "react";
import type { AdminMember, AdminPayout, AdminStats } from "@/lib/admin/data";

function money(minor: number, currency = "MYR"): string {
  const v = minor / 100;
  if (currency === "IDR") return `Rp${v.toLocaleString("id-ID")}`;
  return `RM${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Tab = "overview" | "members" | "payouts";

/**
 * Admin panel.
 *
 * Payouts are the only mutating action: the workflow is manual, so the button
 * moves a request to `paid` and the database's settlement trigger consumes
 * approved earnings oldest-first. Nothing here can invent money — the amount is
 * whatever the member's balance already said.
 */
export function AdminPanel({
  stats,
  members,
  payouts,
}: {
  stats: AdminStats;
  members: AdminMember[];
  payouts: AdminPayout[];
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [rows, setRows] = useState<AdminPayout[]>(payouts);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function markPaid(id: number) {
    setBusy(id);
    setNote(null);
    try {
      const response = await fetch("/api/admin/payout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: "paid" }),
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        setRows((prev) => prev.filter((row) => row.id !== id));
        setNote("Ditanda sebagai dibayar.");
      } else {
        setNote(
          data.code === "settle_failed"
            ? "Gagal: baki earning tidak mencukupi untuk jumlah ini."
            : "Gagal menanda. Sila cuba lagi.",
        );
      }
    } catch {
      setNote("Rangkaian bermasalah.");
    } finally {
      setBusy(null);
    }
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: "Ringkasan" },
    { id: "members", label: `Pengguna (${members.length})` },
    { id: "payouts", label: `Pembayaran (${rows.length})` },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <header className="border-b border-line pb-5">
        <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
          Admin · tidak diindeks
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-white">
          JutaOne.Biz
        </h1>
      </header>

      <nav aria-label="Bahagian admin" className="mt-5 flex flex-wrap gap-1.5">
        {tabs.map((entry) => (
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
        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Pengguna", value: stats.members.toLocaleString("en-US") },
            { label: "Kedai", value: stats.stores.toLocaleString("en-US") },
            {
              label: "Langganan aktif",
              value: `${stats.activeSubscriptions} + ${stats.trialSubscriptions} percubaan`,
            },
            {
              label: "Top-up token",
              value: `${stats.tokenTopUps} · ${money(stats.topUpVolumeMinor)}`,
            },
            {
              label: "Pembayaran tertunda",
              value: `${stats.pendingPayouts} · ${money(stats.pendingPayoutVolumeMinor)}`,
            },
          ].map((card) => (
            <div key={card.label} className="card p-4">
              <p className="text-[11px] tracking-[0.1em] text-muted uppercase">{card.label}</p>
              <p className="mt-1.5 text-lg font-semibold text-white tabular-nums">{card.value}</p>
            </div>
          ))}
        </section>
      )}

      {tab === "members" && (
        <section className="mt-6">
          {members.length === 0 ? (
            <p className="card p-6 text-sm text-muted">
              Tiada akaun berdaftar. Pengguna tanpa akaun tetap boleh menjana iklan dan membuka
              kedai; mereka hanya tidak boleh log masuk dari peranti lain.
            </p>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[10px] tracking-[0.1em] text-muted uppercase">
                    <th className="px-4 py-2.5 font-medium">E-mel</th>
                    <th className="px-4 py-2.5 text-right font-medium">Token</th>
                    <th className="px-4 py-2.5 font-medium">Kedai</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.ownerRef} className="border-b border-line/50 last:border-b-0">
                      <td className="px-4 py-2.5 text-silver">{member.email}</td>
                      <td className="px-4 py-2.5 text-right text-white tabular-nums">
                        {member.tokens.toLocaleString("en-US")}
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {member.storeSlug ? (
                          <a href={`/shop/${member.storeSlug}`} className="text-brand hover:underline">
                            {member.storeSlug}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${
                            member.storeOpen
                              ? "border-emerald-500/30 text-emerald-300"
                              : "border-amber-500/30 text-amber-300"
                          }`}
                        >
                          {member.storeStatus ?? "tiada langganan"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "payouts" && (
        <section className="mt-6">
          {note && (
            <p role="status" className="mb-3 rounded-lg border border-line bg-white/[0.02] p-3 text-xs text-silver">
              {note}
            </p>
          )}
          {rows.length === 0 ? (
            <p className="card p-6 text-sm text-muted">Tiada permintaan pembayaran tertunda.</p>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[10px] tracking-[0.1em] text-muted uppercase">
                    <th className="px-4 py-2.5 font-medium">Kod</th>
                    <th className="px-4 py-2.5 text-right font-medium">Jumlah</th>
                    <th className="px-4 py-2.5 font-medium">Diminta</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-line/50 last:border-b-0">
                      <td className="px-4 py-2.5 font-mono text-xs text-silver">{row.code}</td>
                      <td className="px-4 py-2.5 text-right text-white tabular-nums">
                        {money(row.amountMinor, row.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted">
                        {new Date(row.requestedAt).toLocaleDateString("en-GB")}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-amber-300">{row.status}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => markPaid(row.id)}
                          disabled={busy === row.id}
                          className="rounded-md border border-line px-2.5 py-1 text-xs text-silver transition-colors hover:border-brand/50 hover:text-white disabled:opacity-60"
                        >
                          {busy === row.id ? "Menyimpan…" : "Tanda Dibayar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

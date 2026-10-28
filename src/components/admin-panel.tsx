"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock3,
  Coins,
  CreditCard,
  Search,
  ShieldCheck,
  Store,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";
import type { AdminMember, AdminPayout, AdminStats } from "@/lib/admin/data";
import { sanitizeAmountInput, topupErrorMessage } from "@/lib/admin/tokens";

const PANEL = "panel gap-0 py-0 ring-0";

function money(minor: number, currency = "MYR"): string {
  const value = minor / 100;
  if (currency === "IDR") return `Rp${value.toLocaleString("id-ID")}`;
  return `RM${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Tab = "overview" | "members" | "payouts" | "tokens";

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "emerald" | "amber" | "slate" | "blue";
}) {
  const tones = {
    emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    amber: "border-amber-500/25 bg-amber-500/10 text-amber-300",
    slate: "border-white/10 bg-white/[0.04] text-muted",
    blue: "border-brand/30 bg-brand/10 text-brand-soft",
  } as const;

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-auto gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] uppercase",
        tones[tone],
      )}
    >
      {children}
    </Badge>
  );
}

function Initials({ email }: { email: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand/25 to-brand/5 text-[11px] font-semibold text-brand-soft ring-1 ring-brand/20 ring-inset">
      {email.slice(0, 2).toUpperCase()}
    </span>
  );
}

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
  const [memberQuery, setMemberQuery] = useState("");
  const [payoutQuery, setPayoutQuery] = useState("");
  const [topupEmail, setTopupEmail] = useState("");
  const [topupAmount, setTopupAmount] = useState("");
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupNote, setTopupNote] = useState<string | null>(null);
  const [topupError, setTopupError] = useState<string | null>(null);

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

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "overview", label: "Ringkasan" },
    { id: "members", label: "Pengguna", count: members.length },
    { id: "payouts", label: "Pembayaran", count: rows.length },
    { id: "tokens", label: "Tambah Token Manual" },
  ];

  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) =>
      `${member.email} ${member.storeSlug ?? ""} ${member.storeStatus ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [memberQuery, members]);

  const filteredPayouts = useMemo(() => {
    const query = payoutQuery.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => `${row.code} ${row.status}`.toLowerCase().includes(query));
  }, [payoutQuery, rows]);

  async function submitTopup(event: FormEvent) {
    event.preventDefault();
    if (topupBusy) return;
    const cleanedAmount = sanitizeAmountInput(topupAmount);
    if (!topupEmail.trim() || !cleanedAmount || Number(cleanedAmount) <= 0) {
      setTopupNote(null);
      setTopupError("Isi e-mel pengguna dan jumlah token yang sah dahulu.");
      return;
    }
    setTopupBusy(true);
    setTopupNote(null);
    setTopupError(null);
    try {
      const response = await fetch("/api/admin/add-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_email: topupEmail, amount: Number(cleanedAmount) }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok) {
        const credited = Number(data.credited ?? 0).toLocaleString("en-US");
        const after = Number(data.balanceAfter ?? 0).toLocaleString("en-US");
        setTopupNote(
          `Berjaya! Token telah ditambah. ${credited} token kepada ${data.email ?? topupEmail.trim()}. Baki kini ${after}.`,
        );
        setTopupEmail("");
        setTopupAmount("");
      } else {
        setTopupError(topupErrorMessage(data?.code));
      }
    } catch {
      setTopupError("Rangkaian bermasalah.");
    } finally {
      setTopupBusy(false);
    }
  }

  const statCards = [
    {
      label: "Pengguna",
      value: stats.members.toLocaleString("en-US"),
      hint: "akaun berdaftar",
      icon: Users,
      accent: "text-brand",
      ring: "ring-brand/25",
      glow: "bg-brand/15",
    },
    {
      label: "Kedai",
      value: stats.stores.toLocaleString("en-US"),
      hint: "kedai berdaftar",
      icon: Store,
      accent: "text-sky-400",
      ring: "ring-sky-500/25",
      glow: "bg-sky-500/15",
    },
    {
      label: "Langganan aktif",
      value: stats.activeSubscriptions.toLocaleString("en-US"),
      hint: `${stats.trialSubscriptions} dalam percubaan`,
      icon: CreditCard,
      accent: "text-emerald-400",
      ring: "ring-emerald-500/25",
      glow: "bg-emerald-500/15",
    },
    {
      label: "Top-up token",
      value: money(stats.topUpVolumeMinor),
      hint: `${stats.tokenTopUps} transaksi`,
      icon: Wallet,
      accent: "text-violet-400",
      ring: "ring-violet-500/25",
      glow: "bg-violet-500/15",
    },
    {
      label: "Pembayaran tertunda",
      value: money(stats.pendingPayoutVolumeMinor),
      hint: `${stats.pendingPayouts} permintaan`,
      icon: Clock3,
      accent: "text-amber-400",
      ring: "ring-amber-500/25",
      glow: "bg-amber-500/15",
    },
  ];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <LogoMark size={38} className="h-auto w-[38px] shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[9px] font-semibold tracking-[0.2em] text-muted uppercase">
                  JutaOne.Biz
                </p>
                <span className="rounded-full border border-brand/30 bg-brand/10 px-1.5 py-0.5 text-[8px] font-semibold tracking-[0.12em] text-brand-soft uppercase">
                  Admin
                </span>
              </div>
              <h1 className="mt-0.5 text-[15px] leading-tight font-semibold tracking-[-0.02em] text-white">
                Konsol operasi
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2.5 py-1 text-[10px] text-emerald-300 sm:flex">
              <ShieldCheck className="size-3" /> Tidak diindeks
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_1px_rgba(52,211,153,0.7)]" />
              Sistem berjalan
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-4 py-5 pb-16 sm:px-6">
        <nav
          aria-label="Bahagian admin"
          role="tablist"
          className="flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1"
        >
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              onClick={() => setTab(entry.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
                tab === entry.id
                  ? "bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "text-muted hover:bg-white/[0.03] hover:text-white",
              )}
            >
              {entry.label}
              {typeof entry.count === "number" && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] tabular-nums",
                    tab === entry.id ? "bg-brand/20 text-brand-soft" : "bg-white/[0.05] text-muted",
                  )}
                >
                  {entry.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        {tab === "overview" && (
          <section className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {statCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card key={card.label} className={cn(PANEL, "panel-lift")}>
                    <div className={cn("aurora -top-10 -right-8 h-24 w-24", card.glow)} />
                    <CardContent className="relative p-4">
                      <div className="flex items-start justify-between">
                        <span
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-inset",
                            card.accent,
                            card.ring,
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <ArrowUpRight className="size-3 text-muted/40" />
                      </div>
                      <p className="mt-3.5 text-[9px] tracking-[0.14em] text-muted uppercase">
                        {card.label}
                      </p>
                      <p className="mt-1 text-[19px] leading-tight font-semibold tracking-tight text-white tabular-nums">
                        {card.value}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted">{card.hint}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
              <Card className={PANEL}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[13px] font-semibold text-white">Aliran kerja pembayaran</h2>
                    <StatusBadge tone={stats.pendingPayouts > 0 ? "amber" : "emerald"}>
                      {stats.pendingPayouts > 0 ? `${stats.pendingPayouts} tertunda` : "Bersih"}
                    </StatusBadge>
                  </div>
                  <p className="mt-1.5 max-w-md text-[11px] leading-relaxed text-muted">
                    Semua pengeluaran diproses secara manual. Tanda permintaan sebagai dibayar
                    selepas pemindahan dibuat — baki ahli diselaraskan secara automatik.
                  </p>

                  <div className="mt-4 space-y-0.5">
                    {[
                      ["Jumlah tertunda", money(stats.pendingPayoutVolumeMinor)],
                      ["Permintaan", `${stats.pendingPayouts}`],
                      ["Langganan aktif", `${stats.activeSubscriptions}`],
                      ["Dalam percubaan", `${stats.trialSubscriptions}`],
                    ].map(([label, value], index) => (
                      <div key={label}>
                        {index > 0 && <Separator className="bg-white/[0.05]" />}
                        <div className="flex items-baseline justify-between gap-3 py-2">
                          <span className="text-[11px] text-muted">{label}</span>
                          <span className="text-xs font-medium text-silver tabular-nums">{value}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    onClick={() => setTab("payouts")}
                    className="mt-3 h-9 w-full gap-1.5 rounded-xl bg-brand text-xs font-semibold text-white hover:bg-brand-hover"
                  >
                    Semak pembayaran <ArrowUpRight className="size-3.5" />
                  </Button>
                </CardContent>
              </Card>

              <Card className={PANEL}>
                <CardContent className="p-5">
                  <h2 className="text-[13px] font-semibold text-white">Kesihatan operasi</h2>
                  <p className="mt-1 text-[11px] text-muted">Ringkasan status dalaman.</p>

                  <ul className="mt-4 space-y-2">
                    {[
                      {
                        label: "Akaun berdaftar",
                        value: stats.members,
                        ok: true,
                      },
                      {
                        label: "Kedai berdaftar",
                        value: stats.stores,
                        ok: true,
                      },
                      {
                        label: "Top-up berbayar",
                        value: stats.tokenTopUps,
                        ok: true,
                      },
                      {
                        label: "Pembayaran tertunda",
                        value: stats.pendingPayouts,
                        ok: stats.pendingPayouts === 0,
                      },
                    ].map((item) => (
                      <li
                        key={item.label}
                        className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
                      >
                        <span className="flex items-center gap-2 text-[11px] text-silver">
                          {item.ok ? (
                            <CheckCircle2 className="size-3.5 text-emerald-400" />
                          ) : (
                            <Clock3 className="size-3.5 text-amber-400" />
                          )}
                          {item.label}
                        </span>
                        <span className="text-xs font-medium text-white tabular-nums">{item.value}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {tab === "members" && (
          <section className="mt-4 space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-semibold text-white">Pengguna berdaftar</h2>
                <p className="mt-0.5 text-[11px] text-muted">
                  {filteredMembers.length} daripada {members.length} akaun
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted" />
                <Input
                  value={memberQuery}
                  onChange={(event) => setMemberQuery(event.target.value)}
                  placeholder="Cari e-mel atau kedai…"
                  aria-label="Cari pengguna"
                  className="h-9 rounded-xl border-white/10 bg-white/[0.03] pl-9 text-xs text-silver placeholder:text-muted/70 focus-visible:border-brand/40 focus-visible:ring-brand/20"
                />
                {memberQuery && (
                  <button
                    type="button"
                    onClick={() => setMemberQuery("")}
                    aria-label="Kosongkan carian"
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:text-white"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>

            {members.length === 0 ? (
              <Card className={PANEL}>
                <CardContent className="p-6 text-[13px] text-muted">
                  Tiada akaun berdaftar. Pengguna tanpa akaun tetap boleh menjana iklan dan membuka
                  kedai; mereka hanya tidak boleh log masuk dari peranti lain.
                </CardContent>
              </Card>
            ) : (
              <Card className={cn(PANEL, "overflow-hidden")}>
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/[0.07] hover:bg-transparent">
                      <TableHead className="h-9 px-4 text-[9px] font-medium tracking-[0.14em] text-muted uppercase">
                        Akaun
                      </TableHead>
                      <TableHead className="h-9 px-4 text-right text-[9px] font-medium tracking-[0.14em] text-muted uppercase">
                        Token
                      </TableHead>
                      <TableHead className="h-9 px-4 text-[9px] font-medium tracking-[0.14em] text-muted uppercase">
                        Kedai
                      </TableHead>
                      <TableHead className="h-9 px-4 text-[9px] font-medium tracking-[0.14em] text-muted uppercase">
                        Status
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers.map((member) => (
                      <TableRow
                        key={member.ownerRef}
                        className="border-white/[0.04] hover:bg-white/[0.03]"
                      >
                        <TableCell className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Initials email={member.email} />
                            <div className="min-w-0">
                              <p className="truncate text-[12px] text-silver">{member.email}</p>
                              <p className="text-[10px] text-muted">
                                {member.lastLoginAt
                                  ? `Log masuk ${new Date(member.lastLoginAt).toLocaleDateString("en-GB")}`
                                  : "Belum log masuk"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-right text-[12px] font-medium text-white tabular-nums">
                          {member.tokens.toLocaleString("en-US")}
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          {member.storeSlug ? (
                            <a
                              href={`/shop/${member.storeSlug}`}
                              className="inline-flex items-center gap-1 font-mono text-[11px] text-brand hover:underline"
                            >
                              {member.storeSlug}
                              <ArrowUpRight className="size-2.5" />
                            </a>
                          ) : (
                            <span className="text-[11px] text-muted">—</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          <StatusBadge
                            tone={member.storeOpen ? "emerald" : member.storeStatus ? "amber" : "slate"}
                          >
                            {member.storeStatus ?? "tiada langganan"}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredMembers.length === 0 && (
                  <p className="border-t border-white/[0.04] px-4 py-6 text-center text-[11px] text-muted">
                    Tiada pengguna sepadan dengan carian.
                  </p>
                )}
              </Card>
            )}
          </section>
        )}

        {tab === "tokens" && (
          <section className="mt-4 space-y-3">
            <Card className={PANEL}>
              <CardContent className="p-5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand-soft ring-1 ring-brand/25 ring-inset">
                    <Coins className="size-4" />
                  </span>
                  <div>
                    <h2 className="text-[13px] font-semibold text-white">Tambah Token Manual</h2>
                    <p className="mt-0.5 text-[11px] text-muted">
                      Kredit terus ke lejar pengguna. Dashboard ahli memaparkan baki baharu serta-merta.
                    </p>
                  </div>
                </div>

                <form onSubmit={submitTopup} className="mt-4 grid gap-3 sm:max-w-md">
                  <div>
                    <label htmlFor="topup-email" className="mb-1.5 block text-[11px] font-medium text-silver">
                      E-mel pengguna
                    </label>
                    <Input
                      id="topup-email"
                      type="email"
                      required
                      value={topupEmail}
                      onChange={(event) => setTopupEmail(event.target.value)}
                      placeholder="ali@contoh.com"
                      autoComplete="off"
                      className="h-10 rounded-xl border-white/10 bg-white/[0.03] px-3 text-xs text-silver placeholder:text-muted/70 focus-visible:border-brand/40 focus-visible:ring-brand/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="topup-amount" className="mb-1.5 block text-[11px] font-medium text-silver">
                      Jumlah token
                    </label>
                    <Input
                      id="topup-amount"
                      type="text"
                      required
                      inputMode="numeric"
                      pattern="[0-9, ]*"
                      value={topupAmount}
                      onChange={(event) => setTopupAmount(sanitizeAmountInput(event.target.value))}
                      placeholder="1000000"
                      className="h-10 rounded-xl border-white/10 bg-white/[0.03] px-3 text-xs text-silver tabular-nums placeholder:text-muted/70 focus-visible:border-brand/40 focus-visible:ring-brand/20"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={topupBusy}
                    className="h-10 gap-1.5 rounded-xl bg-brand text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
                  >
                    {topupBusy ? "Menambah…" : "Tambah Token"}
                  </Button>
                </form>

                {topupNote && (
                  <p
                    role="status"
                    className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-2.5 text-[11px] text-emerald-200"
                  >
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
                    {topupNote}
                  </p>
                )}
                {topupError && (
                  <p
                    role="alert"
                    className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.08] px-3 py-2.5 text-[11px] text-red-200"
                  >
                    <X className="size-3.5 shrink-0 text-red-400" />
                    {topupError}
                  </p>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {tab === "payouts" && (
          <section className="mt-4 space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-semibold text-white">Permintaan pembayaran</h2>
                <p className="mt-0.5 text-[11px] text-muted">
                  {filteredPayouts.length} daripada {rows.length} permintaan tertunda
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted" />
                <Input
                  value={payoutQuery}
                  onChange={(event) => setPayoutQuery(event.target.value)}
                  placeholder="Cari kod atau status…"
                  aria-label="Cari pembayaran"
                  className="h-9 rounded-xl border-white/10 bg-white/[0.03] pl-9 text-xs text-silver placeholder:text-muted/70 focus-visible:border-brand/40 focus-visible:ring-brand/20"
                />
                {payoutQuery && (
                  <button
                    type="button"
                    onClick={() => setPayoutQuery("")}
                    aria-label="Kosongkan carian"
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:text-white"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>

            {note && (
              <p
                role="status"
                className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[11px] text-silver"
              >
                <ArrowDownRight className="size-3.5 shrink-0 text-brand" />
                {note}
              </p>
            )}

            {rows.length === 0 ? (
              <Card className={PANEL}>
                <CardContent className="flex items-center gap-2.5 p-6 text-[13px] text-muted">
                  <CheckCircle2 className="size-4 text-emerald-400" />
                  Tiada permintaan pembayaran tertunda.
                </CardContent>
              </Card>
            ) : (
              <Card className={cn(PANEL, "overflow-hidden")}>
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/[0.07] hover:bg-transparent">
                      <TableHead className="h-9 px-4 text-[9px] font-medium tracking-[0.14em] text-muted uppercase">
                        Kod
                      </TableHead>
                      <TableHead className="h-9 px-4 text-right text-[9px] font-medium tracking-[0.14em] text-muted uppercase">
                        Jumlah
                      </TableHead>
                      <TableHead className="h-9 px-4 text-[9px] font-medium tracking-[0.14em] text-muted uppercase">
                        Diminta
                      </TableHead>
                      <TableHead className="h-9 px-4 text-[9px] font-medium tracking-[0.14em] text-muted uppercase">
                        Status
                      </TableHead>
                      <TableHead className="h-9 px-4 text-right text-[9px] font-medium tracking-[0.14em] text-muted uppercase">
                        Tindakan
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayouts.map((row) => (
                      <TableRow key={row.id} className="border-white/[0.04] hover:bg-white/[0.03]">
                        <TableCell className="px-4 py-2.5 font-mono text-[11px] text-silver">
                          {row.code}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-right text-[12px] font-medium text-white tabular-nums">
                          {money(row.amountMinor, row.currency)}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-[11px] text-muted">
                          {new Date(row.requestedAt).toLocaleDateString("en-GB")}
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          <StatusBadge tone="amber">{row.status}</StatusBadge>
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => markPaid(row.id)}
                            disabled={busy === row.id}
                            className="h-8 rounded-lg border-white/10 bg-white/[0.03] px-3 text-[11px] font-medium text-silver hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-white disabled:opacity-50"
                          >
                            {busy === row.id ? "Menyimpan…" : "Tanda Dibayar"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredPayouts.length === 0 && (
                  <p className="border-t border-white/[0.04] px-4 py-6 text-center text-[11px] text-muted">
                    Tiada pembayaran sepadan dengan carian.
                  </p>
                )}
              </Card>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

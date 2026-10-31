import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  LayoutDashboard,
  Settings,
  Store,
  Network,
  Sparkles,
  Wallet,
} from "lucide-react";
import { MemberSettingsForm } from "@/components/member-settings-form";
import { SESSION_COOKIE, getMemberProfile, verifySession } from "@/lib/auth/member";
import { getSupabase } from "@/lib/db";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tetapan Akaun — JutaOne.Biz",
  robots: { index: false, follow: false },
};

async function loadBank(ownerRef: string) {
  const db = getSupabase();
  if (!db) return { bankName: "", accountNo: "", accountHolder: "" };
  const { data, error } = await db
    .from("members")
    .select("bank_name, account_no, account_holder")
    .eq("owner_ref", ownerRef)
    .maybeSingle();
  if (error || !data) return { bankName: "", accountNo: "", accountHolder: "" };
  const row = data as Record<string, unknown>;
  return {
    bankName: (row.bank_name as string | null) ?? "",
    accountNo: (row.account_no as string | null) ?? "",
    accountHolder: (row.account_holder as string | null) ?? "",
  };
}

/**
 * Tetapan Akaun (Boss spec): Profil + Tukar Kata Laluan + Butiran Bank.
 * Dual-Tone: kandungan cerah slate-100, kad putih bersih, sidebar navy gelap
 * yang sama seperti dashboard utama.
 */
export default async function SettingsPage() {
  const jar = await cookies();
  const ownerRef = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!ownerRef) redirect("/login?next=/dashboard/settings");

  const [profile, bank] = await Promise.all([
    getMemberProfile(ownerRef),
    loadBank(ownerRef),
  ]);
  if (!profile) redirect("/login?next=/dashboard/settings");

  const name = profile.displayName?.trim() || profile.email.split("@")[0] || "rakan";

  const sideLinks = [
    { href: "/dashboard", label: "Papan Pemuka", hint: "Bisnes anda hari ini", icon: LayoutDashboard },
    { href: "/store", label: "Kedai Saya", hint: "Produk & pesanan", icon: Store },
    { href: "/dashboard/affiliate", label: "Program Affiliate", hint: "Rakan rujukan", icon: Network },
    { href: "/dashboard/ads", label: "Alat AI", hint: "Penjana Iklan", icon: Sparkles },
  ];

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-[1180px] gap-6 px-4 py-5 pb-24 sm:px-6 lg:pb-8">
        <aside className="hidden w-[252px] shrink-0 lg:block">
          <div className="panel sticky top-5 flex h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-4">
            <div className="aurora -top-16 -left-10 h-40 w-40 bg-brand/15" />
            <div className="relative flex items-center gap-2.5 px-1.5">
              <LogoMark size={40} className="h-auto w-10 shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] font-semibold tracking-[0.2em] text-muted uppercase">
                  JutaOne.Biz
                </p>
                <p className="truncate text-sm font-semibold text-white">Konsol ahli</p>
              </div>
            </div>

            <nav aria-label="Navigasi dashboard" className="relative mt-5 space-y-1">
              {sideLinks.map((entry) => {
                const Icon = entry.icon;
                return (
                  <Link
                    key={entry.href + entry.label}
                    href={entry.href}
                    className="group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all text-muted hover:bg-white/[0.04] hover:text-white"
                  >
                    <Icon className="size-[17px] shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{entry.label}</span>
                      <span className="block truncate text-[10px] text-muted/70">{entry.hint}</span>
                    </span>
                  </Link>
                );
              })}
              <Link
                href="/dashboard/settings"
                aria-current="page"
                className="group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all bg-gradient-to-r from-brand/18 via-brand/[0.06] to-transparent text-white ring-1 ring-brand/25 ring-inset"
              >
                <Settings className="size-[17px] shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">Tetapan Akaun</span>
                  <span className="block truncate text-[10px] text-brand-soft/80">
                    Profil & kata laluan
                  </span>
                </span>
              </Link>
            </nav>

            <div className="relative mt-auto">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <span className="flex items-center gap-1.5 text-[10px] tracking-[0.12em] text-muted uppercase">
                  <Wallet className="size-3.5 text-brand" /> Akaun
                </span>
                <p className="mt-1 truncate text-xs font-medium text-white">{name}</p>
                <p className="truncate text-[10px] text-muted">{profile.email}</p>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <Link
            href="/dashboard"
            className="inline-flex min-h-[44px] items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-900"
          >
            <ArrowLeft className="size-3.5" aria-hidden /> Kembali ke Dashboard
          </Link>

          <header className="mt-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.2em] text-slate-500 uppercase">
              <Settings className="size-3.5 text-brand" /> Tetapan Akaun
            </p>
            <h1
              className={cn(
                "mt-1.5 text-2xl leading-tight font-semibold tracking-[-0.03em] break-words sm:text-3xl",
              )}
            >
              Tetapan Akaun
            </h1>
            <p className="mt-1 text-[13px] text-slate-500">
              Kemas kini profil, kata laluan dan butiran bank untuk payout — semua di satu tempat.
            </p>
          </header>

          <div className="mt-5">
            <MemberSettingsForm
              initial={{
                email: profile.email,
                displayName: profile.displayName ?? "",
                bankName: bank.bankName,
                accountNo: bank.accountNo,
                accountHolder: bank.accountHolder,
              }}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

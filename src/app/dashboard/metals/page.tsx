import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MemberMetals } from "@/components/member-metals";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analisis Emas & Perak | JutaOne.Biz",
  robots: { index: false, follow: false },
};

/**
 * Members-area premium metals analysis (Boss spec Task 1).
 *
 * Behind the member session so every analysis charges the member's own token
 * ledger (2,000 tokens, enforced in `/api/metals`). Mounting this page never
 * spends tokens — only the "Dapatkan Analisis" button fires the metered call.
 */
export default async function MemberMetalsPage() {
  const jar = await cookies();
  const ownerRef = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!ownerRef) redirect("/login?next=/dashboard/metals");

  return (
    <div className="min-h-dvh">
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <Link
          href="/dashboard"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-xs text-muted transition-colors hover:text-white"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> Kembali ke Dashboard
        </Link>

        <header className="mt-5">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[10px] font-semibold tracking-[0.18em] text-amber-200 uppercase">
            Analisis Premium · Metal Sentinel
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
            Analisis Emas &amp; Perak
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Harga spot sebenar, julat harian dan isyarat trend — angka sahaja,
            bukan nasihat pelaburan. Setiap analisis menolak 2,000 token.
          </p>
        </header>

        <div className="mt-6">
          <MemberMetals initialCurrency="MYR" />
        </div>
      </main>
    </div>
  );
}

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MemberAds } from "@/components/member-ads";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Penjana Iklan AI | JutaOne.Biz",
  robots: { index: false, follow: false },
};

/**
 * Members-area paid ad generator (Boss spec: `/dashboard/ads`).
 *
 * Behind the member session so every generation charges the member's own
 * token ledger (20,000 tokens, enforced in `/api/ads/generate`). Mounting
 * this page never spends tokens — only the "Jana Iklan" button fires the
 * metered call. Members never touch the public `/#demo` trial from here.
 */
export default async function MemberAdsPage() {
  const jar = await cookies();
  const ownerRef = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!ownerRef) redirect("/login?next=/dashboard/ads");

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
          <p className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-[10px] font-semibold tracking-[0.18em] text-brand-soft uppercase">
            Penjana Iklan · Ahli Berbayar
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
            Penjana Iklan AI
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Tukar satu ayat produk kepada kapsyen TikTok atau Facebook yang sedia
            untuk disiarkan. Setiap penjanaan menolak 20,000 token.
          </p>
        </header>

        <div className="mt-6">
          <MemberAds />
        </div>
      </main>
    </div>
  );
}

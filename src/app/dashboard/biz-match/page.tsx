import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BizMatchSearch } from "@/components/biz-match-search";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/member";
import { getSupabase } from "@/lib/db";
import { exaConfigured } from "@/lib/exa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Biz-Match — Cari Pembekal | JutaOne.Biz",
  robots: { index: false, follow: false },
};

/** Categories currently present in the directory, to seed the filter. */
async function categories(): Promise<string[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data } = await db
    .from("supplier_directory")
    .select("category")
    .eq("active", true)
    .not("category", "is", null)
    .limit(500);
  const set = new Set<string>();
  for (const row of (data ?? []) as Array<{ category: string | null }>) {
    if (row.category) set.add(row.category);
  }
  return [...set].sort();
}

/**
 * Members-area Biz-Match (Boss spec Task 2).
 *
 * Same metered search as the public `/directory`, but behind the member
 * session so every search charges the member's own token ledger. Dark premium
 * "AI giant" styling throughout.
 */
export default async function MemberBizMatchPage() {
  const jar = await cookies();
  const ownerRef = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!ownerRef) redirect("/login?next=/dashboard/biz-match");

  const list = await categories();

  return (
    <div className="min-h-dvh">
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <Link
          href="/dashboard"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-xs text-muted transition-colors hover:text-white"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> Kembali ke Dashboard
        </Link>
        <div className="mt-5">
          <BizMatchSearch categories={list} liveSearch={exaConfigured()} />
        </div>
        <p className="mt-8 text-center text-[11px] leading-relaxed text-muted/70">
          Carian yang berjaya ditolak 10,000 token daripada baki anda. Carian gagal
          atau tiada hasil adalah percuma.
        </p>
      </main>
    </div>
  );
}

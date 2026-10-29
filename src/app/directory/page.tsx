import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BizMatchSearch } from "@/components/biz-match-search";
import { getSupabase } from "@/lib/db";
import { exaConfigured } from "@/lib/exa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Biz-Match — Cari pembekal borong | JutaOne.Biz",
  description:
    "Cari pembekal borong di Malaysia dan Indonesia. Carian semantik untuk pembekal kain, pembungkusan, makanan dan lagi.",
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

export default async function DirectoryPage() {
  const list = await categories();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-white"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> Laman utama
      </Link>
      <div className="mt-6">
        <BizMatchSearch categories={list} liveSearch={exaConfigured()} />
      </div>
      <p className="mt-8 text-center text-[11px] leading-relaxed text-muted/70">
        Carian yang berjaya ditolak 10,000 token. Carian gagal atau tiada hasil adalah percuma.
      </p>
    </main>
  );
}

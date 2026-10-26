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
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <header className="border-b border-line pb-6">
        <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Biz-Match</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-white">
          Cari pembekal borong
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Carian semantik merentas web, dengan direktori tempatan sebagai sandaran.
          Data daripada daftar rasmi ditandakan{" "}
          <span className="text-silver">Verified</span>; hasil carian web tidak.
        </p>
      </header>

      <BizMatchSearch categories={list} liveSearch={exaConfigured()} />
    </main>
  );
}

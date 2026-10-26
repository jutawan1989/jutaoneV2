import { DirectorySearch } from "@/components/directory-search";
import { getSupabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Biz-Match — Direktori pembekal | JutaOne.Biz",
  description:
    "Cari pembekal di Malaysia dan Indonesia. Tapis mengikut kategori dan negara.",
};

export type DirectorySupplier = {
  id: number;
  company_name: string;
  category: string | null;
  location: string | null;
  country: string;
  contact_info: Record<string, string>;
  website: string | null;
  verified: boolean;
  source: string;
};

type SearchParams = { q?: string; category?: string; country?: string };

/**
 * Biz-Match directory.
 *
 * Results are rendered on the server so the first paint already contains
 * suppliers — a search page that flashes empty on every keystroke feels broken
 * on a slow connection. The client component takes over once mounted.
 */
async function search(params: SearchParams): Promise<DirectorySupplier[]> {
  const db = getSupabase();
  if (!db) return [];

  const { data, error } = await db.rpc("jutaone_search_suppliers", {
    p_query: params.q ?? null,
    p_category: params.category ?? null,
    p_country: params.country ?? null,
    p_limit: 30,
  });

  if (error) {
    console.error("[jutaone] directory search failed", error.message);
    return [];
  }
  return (data ?? []) as DirectorySupplier[];
}

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const results = await search(params);

  const categories = Array.from(
    new Set(results.map((row) => row.category).filter((value): value is string => Boolean(value))),
  ).sort();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <header className="border-b border-line pb-6">
        <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
          Biz-Match
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-white">
          Cari pembekal yang tepat
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Direktori pembekal Malaysia dan Indonesia. Data daripada daftar rasmi
          ditandakan <span className="text-silver">Verified</span>; data import
          tidak.
        </p>
      </header>

      <DirectorySearch
        initialResults={results}
        initialQuery={params.q ?? ""}
        initialCategory={params.category ?? ""}
        initialCountry={params.country ?? ""}
        categories={categories}
        total={results.length}
      />
    </main>
  );
}

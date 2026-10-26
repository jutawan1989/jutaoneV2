/**
 * Exa adapter for Biz-Match supplier search.
 *
 * Request shape follows the `build-with-exa` skill: a query plus
 * `contents: { highlights: true }`, and nothing else. Every other field is
 * gated — `numResults`, `type` and `includeDomains` are only set when a task
 * actually needs them, because adding controls "because they look useful" makes
 * the request harder to reason about and can quietly change retrieval quality.
 *
 * Results are normalised into the same shape as `supplier_directory`, so the UI
 * renders one card component whether a row came from Exa or from our own table.
 */
const EXA_URL = "https://api.exa.ai/search";

export type SupplierResult = {
  /** Stable key for React and for "save to database". */
  id: string;
  companyName: string;
  category: string | null;
  location: string | null;
  country: string | null;
  description: string | null;
  url: string | null;
  /** Where the row came from: live search or our own directory. */
  origin: "exa" | "directory";
  verified: boolean;
};

export function exaConfigured(): boolean {
  return Boolean(process.env.EXA_API_KEY);
}

type ExaHighlight = string;
type ExaResult = {
  id?: string;
  title?: string | null;
  url?: string | null;
  highlights?: ExaHighlight[];
  summary?: string | null;
  /** Present when Exa resolves the query to places rather than pages. */
  entities?: Array<{
    properties?: {
      name?: string | null;
      description?: string | null;
      categories?: string[];
      address?: { street?: string | null; region?: string | null; country?: string | null };
      website?: string | null;
    };
  }>;
};

type ExaResponse = {
  results?: ExaResult[];
  error?: string;
  requestId?: string;
};

/**
 * Pulls the most useful business name out of a result.
 *
 * Exa sometimes answers a supplier query with a "places" entity instead of a
 * page. The entity's own name is far better than the page title, which is
 * usually "<query> - Exa Places".
 */
function companyNameFrom(result: ExaResult): string | null {
  const entityName = result.entities?.[0]?.properties?.name;
  if (entityName && entityName.trim()) return entityName.trim();

  const title = result.title?.trim();
  if (!title) return null;
  // Strip the generator suffix Exa adds to library pages.
  return title.replace(/\s*[-–|]\s*Exa (Places|Library).*$/i, "").trim() || null;
}

export function normalizeExaResults(payload: ExaResponse): SupplierResult[] {
  const out: SupplierResult[] = [];

  for (const result of payload.results ?? []) {
    const entity = result.entities?.[0]?.properties;
    const name = companyNameFrom(result);
    if (!name) continue;

    const address = entity?.address;
    const location =
      [address?.street, address?.region].filter(Boolean).join(", ").slice(0, 120) || null;

    const highlight = result.highlights?.[0]?.replace(/\s+/g, " ").trim();

    out.push({
      id: result.id ?? result.url ?? `exa-${out.length}`,
      companyName: name,
      category: entity?.categories?.[0] ?? null,
      location,
      country: address?.country ?? null,
      description: highlight ?? entity?.description ?? result.summary ?? null,
      url: entity?.website ?? result.url ?? null,
      origin: "exa",
      // Exa is a web index, not a company registry: nothing it returns is a
      // verified record, so the badge must not appear on these cards.
      verified: false,
    });
  }

  return out;
}

export async function searchSuppliers(query: string): Promise<SupplierResult[]> {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("EXA_API_KEY is not configured");

  const response = await fetch(EXA_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({
      query,
      // Highlights give the card a real description without shipping whole pages.
      contents: { highlights: true },
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (response.status === 401) throw new Error("Exa rejected the API key (401)");
  if (response.status === 429) throw new Error("Exa rate limit reached (429)");
  if (!response.ok) throw new Error(`Exa responded ${response.status}`);

  const payload = (await response.json()) as ExaResponse;
  if (payload.error) throw new Error(`Exa: ${payload.error}`);

  return normalizeExaResults(payload);
}

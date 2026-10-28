import { searchSuppliers as exaSearch, type SupplierResult } from "@/lib/exa";
import {
  hostMatchesCountry,
  providerDomains,
  type SearchCountry,
} from "@/lib/geo-domains";

/**
 * Provider-agnostic supplier search for Biz-Match.
 *
 * Boss spec: 4 layers — Exa -> Tavily -> Serper -> Supabase directory.
 * The route calls `searchSuppliers`; which provider answers is configuration,
 * not code.
 *
 * MEASURED: Tavily has no keyless mode. `POST /search` without a key returns
 * `401 Unauthorized: missing or invalid API key`, and so does a bogus bearer.
 * Tavily is simply unavailable until `TAVILY_API_KEY` is set, and the adapter
 * reports that rather than pretending to work.
 *
 * Serper.dev is the third layer. `POST https://google.serper.dev/search` with
 * the key in the `X-API-KEY` header, country-pinned with `gl`/`hl`
 * (MY -> gl=my/hl=ms, ID -> gl=id/hl=id). Without a key it is skipped the
 * same way as the others.
 */

export type SearchProvider = "exa" | "tavily" | "serper";

export type { SupplierResult };

export type ProviderOutcome = {
  provider: SearchProvider;
  ok: boolean;
  results: SupplierResult[];
  /** Present when the provider failed or was unusable. */
  error?: string;
  /** True when the provider had no credentials, so it was never attempted. */
  unconfigured?: boolean;
};

const TAVILY_URL = "https://api.tavily.com/search";
const SERPER_URL = "https://google.serper.dev/search";

/**
 * The provider order. `SEARCH_PROVIDER` (exa | tavily | serper) picks the
 * primary; the other two follow in the spec order Exa -> Tavily -> Serper,
 * so removing the primary never duplicates or drops a layer.
 */
export const PROVIDER_ORDER: readonly SearchProvider[] = ["exa", "tavily", "serper"];

export function tavilyConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

export function exaConfigured(): boolean {
  return Boolean(process.env.EXA_API_KEY);
}

export function serperConfigured(): boolean {
  return Boolean(process.env.SERPER_API_KEY);
}

/** The configured primary provider, defaulting to Exa per the Boss spec. */
export function primaryProvider(): SearchProvider {
  const raw = (process.env.SEARCH_PROVIDER || "exa").toLowerCase();
  if (raw === "tavily") return "tavily";
  if (raw === "serper") return "serper";
  return "exa";
}

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
};

type TavilyResponse = {
  results?: TavilyResult[];
  detail?: { error?: string } | string;
};

/**
 * Cleans Tavily's page titles into a business name.
 *
 * Tavily returns real page titles ("Zaine Textile | Pemborong Kain Kelantan"),
 * so the segment before the first separator is usually the company. A title that
 * is obviously an article ("10 Senarai Pembekal…") is kept as-is rather than
 * mangled — a wrong name is worse than an untidy one.
 */
function companyNameFromTitle(title: string): string | null {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const parts = cleaned.split(/\s*[|–—]\s*|\s+-\s+/);
  const first = parts[0]?.trim();
  if (first && first.length >= 3 && first.length <= 80) return first;
  return cleaned.slice(0, 120);
}

export function normalizeTavilyResults(payload: TavilyResponse): SupplierResult[] {
  const out: SupplierResult[] = [];

  for (const [index, result] of (payload.results ?? []).entries()) {
    const name = result.title ? companyNameFromTitle(result.title) : null;
    if (!name || !result.url) continue;

    out.push({
      id: result.url || `tavily-${index}`,
      companyName: name,
      category: null,
      location: null,
      country: null,
      // `content` is Tavily's extracted snippet, which is exactly what a card
      // needs; no extra contents request is required.
      description: result.content?.replace(/\s+/g, " ").trim().slice(0, 300) ?? null,
      url: result.url,
      origin: "exa", // all live web results share one card shape; the UI treats them the same
      // A web hit is not a registry record, so it must never carry the badge.
      verified: false,
    });
  }

  return out;
}

type SerperOrganic = {
  title?: string;
  link?: string;
  snippet?: string;
};

type SerperResponse = {
  organic?: SerperOrganic[];
  error?: string;
};

function serperLocale(country: SearchCountry): { gl: string; hl: string } {
  return country === "ID" ? { gl: "id", hl: "id" } : { gl: "my", hl: "ms" };
}

export function normalizeSerperResults(payload: SerperResponse): SupplierResult[] {
  const out: SupplierResult[] = [];
  const seen = new Set<string>();

  for (const [index, result] of (payload.organic ?? []).entries()) {
    const name = result.title ? companyNameFromTitle(result.title) : null;
    if (!name || !result.link || seen.has(result.link)) continue;
    seen.add(result.link);

    out.push({
      id: result.link || `serper-${index}`,
      companyName: name,
      category: null,
      location: null,
      country: null,
      description: result.snippet?.replace(/\s+/g, " ").trim().slice(0, 300) ?? null,
      url: result.link,
      origin: "exa", // all live web results share one card shape; the UI treats them the same
      // A web hit is not a registry record, so it must never carry the badge.
      verified: false,
    });
  }

  return out;
}

async function serperSearch(query: string, country: SearchCountry): Promise<SupplierResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error("SERPER_API_KEY is not configured");

  const locale = serperLocale(country);
  const response = await fetch(SERPER_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({
      q: query,
      // Country-pinned Google results; Serper counts num > 10 as two searches.
      num: 10,
      gl: locale.gl,
      hl: locale.hl,
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Serper rejected the API key (401/403)");
  }
  if (response.status === 429) throw new Error("Serper rate limit reached (429)");
  if (!response.ok) throw new Error(`Serper responded ${response.status}`);

  const payload = (await response.json()) as SerperResponse;
  if (payload.error) throw new Error(`Serper: ${payload.error}`);
  return normalizeSerperResults(payload);
}

async function tavilySearch(query: string, country: SearchCountry): Promise<SupplierResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is not configured");

  const response = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query,
      // Basic search is the cheapest tier; `content` comes back with it, so no
      // separate extraction call is needed.
      search_depth: "basic",
      // Country-localised: only the country's own registrable suffixes.
      include_domains: providerDomains(country),
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (response.status === 401) throw new Error("Tavily rejected the API key (401)");
  if (response.status === 429) throw new Error("Tavily rate limit reached (429)");
  if (!response.ok) throw new Error(`Tavily responded ${response.status}`);

  const payload = (await response.json()) as TavilyResponse;
  if (payload.detail) {
    const message =
      typeof payload.detail === "string" ? payload.detail : payload.detail.error;
    if (message) throw new Error(`Tavily: ${message}`);
  }
  return normalizeTavilyResults(payload);
}

/** Dispatches to one provider. Never tries another; the caller decides that. */
export async function runProvider(
  provider: SearchProvider,
  query: string,
  country: SearchCountry,
): Promise<ProviderOutcome> {
  try {
    const raw =
      provider === "tavily"
        ? await tavilySearch(query, country)
        : provider === "serper"
          ? await serperSearch(query, country)
          : await exaSearch(query, country);

    // Local allow-list on top of the provider's filter: a provider may treat
    // includeDomains loosely, and one wrong-country card undoes the feature.
    const results = raw.filter((result) => hostMatchesCountry(result.url, country));
    const dropped = raw.length - results.length;
    if (dropped > 0) {
      console.warn(`[jutaone] ${provider} returned ${dropped} off-country result(s); dropped`);
    }

    return { provider, ok: true, results };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unconfigured = /not configured/i.test(message);
    return { provider, ok: false, results: [], error: message, unconfigured };
  }
}

/**
 * Searches suppliers with the configured primary first, then the remaining
 * live layers in spec order (Exa -> Tavily -> Serper).
 *
 * Returns the first non-empty result set. An empty result set is treated as
 * "no answer" rather than success, so a provider that finds nothing does not
 * stop the next one from being tried. The Supabase directory (layer 4) stays
 * in the API route: it is the free fallback and is never charged.
 */
export async function searchSuppliers(
  query: string,
  country: SearchCountry,
  provider: SearchProvider = primaryProvider(),
): Promise<{ outcome: ProviderOutcome; attempts: ProviderOutcome[] }> {
  const order: SearchProvider[] = [
    provider,
    ...PROVIDER_ORDER.filter((candidate) => candidate !== provider),
  ];
  const attempts: ProviderOutcome[] = [];

  for (const candidate of order) {
    const outcome = await runProvider(candidate, query, country);
    attempts.push(outcome);
    if (outcome.ok && outcome.results.length > 0) {
      return { outcome, attempts };
    }
  }

  // Nothing worked: report the primary's outcome so the caller's error message
  // names the provider the operator expects to be using.
  return { outcome: attempts[0], attempts };
}

import { searchSuppliers as exaSearch, type SupplierResult } from "@/lib/exa";
import {
  hostMatchesCountry,
  providerDomains,
  type SearchCountry,
} from "@/lib/geo-domains";

/**
 * Provider-agnostic supplier search for Biz-Match.
 *
 * Linda's decision: Tavily's free tier (1,000 credits/month) is the development
 * default, Exa is the alternative, and switching must not touch the API route or
 * the UI. The route calls `searchSuppliers`; which provider answers is
 * configuration, not code.
 *
 * MEASURED: Tavily has no keyless mode. `POST /search` without a key returns
 * `401 Unauthorized: missing or invalid API key`, and so does a bogus bearer.
 * The brief mentioned a keyless path for initial testing — there is none, so
 * Tavily is simply unavailable until `TAVILY_API_KEY` is set, and the adapter
 * reports that rather than pretending to work.
 */

export type SearchProvider = "tavily" | "exa";

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

export function tavilyConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

export function exaConfigured(): boolean {
  return Boolean(process.env.EXA_API_KEY);
}

/** The configured primary provider, defaulting to Tavily per Linda's decision. */
export function primaryProvider(): SearchProvider {
  const raw = (process.env.SEARCH_PROVIDER || "tavily").toLowerCase();
  return raw === "exa" ? "exa" : "tavily";
}

/** The other provider, tried when the primary fails. */
export function secondaryProvider(primary: SearchProvider): SearchProvider {
  return primary === "tavily" ? "exa" : "tavily";
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
      origin: "exa", // both are live web results; the UI treats them the same
      // A web hit is not a registry record, so it must never carry the badge.
      verified: false,
    });
  }

  return out;
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
 * Searches suppliers with the primary provider, falling back to the secondary.
 *
 * Returns the first non-empty result set. An empty result set is treated as
 * "no answer" rather than success, so a provider that finds nothing does not
 * stop the other one from being tried.
 */
export async function searchSuppliers(
  query: string,
  country: SearchCountry,
  provider: SearchProvider = primaryProvider(),
): Promise<{ outcome: ProviderOutcome; attempts: ProviderOutcome[] }> {
  const order: SearchProvider[] = [provider, secondaryProvider(provider)];
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

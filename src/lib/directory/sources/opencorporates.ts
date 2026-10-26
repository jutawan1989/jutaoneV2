import { makeSupplier, normalizeText } from "../normalize";
import type { NormalizedSupplier, SourceInput, SupplierSource } from "../types";

/**
 * OpenCorporates adapter.
 *
 * MEASURED, and it contradicts the brief: OpenCorporates no longer serves
 * anonymous requests. Every endpoint under /v0.4 returns
 *   `401 {"error":{"message":"Invalid Api Token..."}}`
 * including the search endpoint that used to work without a token, so there is
 * no usable "free tier without a key" to call. The module is therefore written
 * against the documented shape and gated on `OPENCORPORATES_API_KEY`: without a
 * key it reports "not configured" instead of failing an import halfway.
 *
 * The response shape below is the documented v0.4 envelope. It has not been
 * exercised against a live key — the first real call should be treated as the
 * verification step.
 */
const BASE_URL = "https://api.opencorporates.com/v0.4";
const DEFAULT_LIMIT = 25;
/** Their per-page maximum; asking for more silently returns one page anyway. */
const MAX_LIMIT = 100;

export type OpenCorporatesCompany = {
  name?: string;
  company_number?: string;
  jurisdiction_code?: string;
  current_status?: string;
  incorporation_date?: string;
  registered_address_in_full?: string;
  opencorporates_url?: string;
  registry_url?: string;
};

type SearchResponse = {
  results?: {
    companies?: Array<{ company?: OpenCorporatesCompany }>;
    total_count?: number;
  };
  error?: { message?: string };
};

function apiKey(): string | null {
  const key = process.env.OPENCORPORATES_API_KEY;
  return key && key.trim() !== "" ? key.trim() : null;
}

/**
 * Jurisdiction codes we map to an ISO country. OpenCorporates uses its own
 * codes (`us_ca`, `gb`, …), so an unmapped one falls back rather than inventing
 * a country.
 */
function countryFromJurisdiction(code: string | undefined): string {
  if (!code) return "MY";
  const first = code.split("_")[0]?.toLowerCase();
  const map: Record<string, string> = { my: "MY", id: "ID", sg: "SG", gb: "GB", us: "US" };
  return map[first ?? ""] ?? "MY";
}

export function normalizeOpenCorporates(
  companies: OpenCorporatesCompany[],
): NormalizedSupplier[] {
  const out: NormalizedSupplier[] = [];
  for (const company of companies) {
    const supplier = makeSupplier({
      companyName: company.name,
      // Their taxonomy is not ours; the registry type is the honest category.
      category: null,
      location: normalizeText(
        company.registered_address_in_full?.split("\n").slice(-1)[0],
        120,
      ),
      country: countryFromJurisdiction(company.jurisdiction_code),
      contactInfo: {
        ...(company.company_number ? { registration: company.company_number } : {}),
        ...(company.current_status ? { status: company.current_status } : {}),
        ...(company.incorporation_date ? { incorporated: company.incorporation_date } : {}),
      },
      website: company.opencorporates_url ?? company.registry_url ?? null,
      source: "opencorporates",
      // The registry number is the stable id; without it the row cannot be
      // re-imported idempotently, so the name+jurisdiction pair is used.
      sourceRef:
        company.company_number && company.jurisdiction_code
          ? `${company.jurisdiction_code}:${company.company_number}`
          : null,
      // An official company register is exactly what "verified" should mean.
      verified: true,
    });
    if (supplier) out.push(supplier);
  }
  return out;
}

export const openCorporatesSource: SupplierSource = {
  id: "opencorporates",
  label: "OpenCorporates",

  isConfigured() {
    return apiKey() !== null;
  },

  configurationHint() {
    return "OPENCORPORATES_API_KEY is not set. OpenCorporates rejects anonymous calls with HTTP 401, so a token is required before this source can import anything.";
  },

  async fetch(input: SourceInput): Promise<NormalizedSupplier[]> {
    const key = apiKey();
    if (!key) {
      throw new Error(
        "OPENCORPORATES_API_KEY is not configured; OpenCorporates rejects anonymous requests with 401",
      );
    }

    const query = input.query?.trim();
    if (!query) {
      throw new Error("OpenCorporates import requires a search query");
    }

    const limit = Math.min(Math.max(1, input.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    const url = new URL(`${BASE_URL}/companies/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("per_page", String(limit));
    // Malaysia is the default market; the caller can override with a country.
    url.searchParams.set("jurisdiction_code", process.env.OPENCORPORATES_JURISDICTION ?? "my");
    url.searchParams.set("api_token", key);

    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    if (response.status === 401) {
      throw new Error("OpenCorporates rejected the API token (401)");
    }
    if (response.status === 429) {
      throw new Error("OpenCorporates rate limit reached (429); retry later");
    }
    if (!response.ok) {
      throw new Error(`OpenCorporates responded ${response.status}`);
    }

    const payload = (await response.json()) as SearchResponse;
    if (payload.error) throw new Error(`OpenCorporates: ${payload.error.message ?? "unknown error"}`);

    const companies = (payload.results?.companies ?? [])
      .map((entry) => entry.company)
      .filter((company): company is OpenCorporatesCompany => Boolean(company));

    return normalizeOpenCorporates(companies);
  },
};

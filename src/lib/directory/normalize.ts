import type { NormalizedSupplier, SupplierSourceId } from "./types";

/**
 * Shared normalisation so every adapter produces the same clean shape.
 *
 * A source's quirks are contained here: a missing category becomes null rather
 * than an empty string, a country is uppercased and validated, a website is
 * rejected unless it is a real http(s) URL, and a row with no usable name is
 * dropped instead of stored.
 */

const COUNTRY_ALIASES: Record<string, string> = {
  malaysia: "MY",
  my: "MY",
  "malaysia (my)": "MY",
  indonesia: "ID",
  id: "ID",
  "indonesia (id)": "ID",
  singapore: "SG",
  sg: "SG",
};

export function normalizeCountry(raw: string | null | undefined, fallback = "MY"): string {
  if (!raw) return fallback;
  const key = raw.trim().toLowerCase();
  const mapped = COUNTRY_ALIASES[key];
  if (mapped) return mapped;
  const upper = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : fallback;
}

export function normalizeText(value: string | null | undefined, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, max);
}

/**
 * Only absolute http(s) URLs survive. A relative path would resolve against our
 * own origin, and `javascript:` is stored XSS waiting for the first click.
 */
export function normalizeUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const raw = value.trim();
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Contact details are free-form but must be strings, keyed for the UI. */
export function normalizeContact(
  input: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value.trim() !== "") {
      out[key.slice(0, 24)] = value.trim().slice(0, 200);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      out[key.slice(0, 24)] = String(value);
    }
  }
  return out;
}

export function makeSupplier(input: {
  companyName: string | null | undefined;
  category?: string | null;
  location?: string | null;
  country?: string | null;
  contactInfo?: Record<string, unknown> | null;
  website?: string | null;
  source: SupplierSourceId;
  sourceRef?: string | null;
  verified: boolean;
}): NormalizedSupplier | null {
  const companyName = normalizeText(input.companyName, 200);
  // A supplier with no name is not a supplier; dropping it is better than
  // storing a row that can never be found or contacted.
  if (!companyName) return null;

  return {
    companyName,
    category: normalizeText(input.category, 80),
    location: normalizeText(input.location, 120),
    country: normalizeCountry(input.country),
    contactInfo: normalizeContact(input.contactInfo),
    website: normalizeUrl(input.website),
    source: input.source,
    sourceRef: normalizeText(input.sourceRef, 200),
    verified: input.verified,
  };
}

/** Registry of which sources count as official, so `verified` stays honest. */
const OFFICIAL_SOURCES = new Set<SupplierSourceId>(["opencorporates", "opendata"]);

export function sourceIsOfficial(source: SupplierSourceId): boolean {
  return OFFICIAL_SOURCES.has(source);
}

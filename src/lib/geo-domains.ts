/**
 * Country → domain suffixes used to localise supplier search.
 *
 * Boss reported Indonesian users seeing Malaysian suppliers and vice versa, so
 * results are pinned to the country's own web space.
 *
 * Two things measured against the live API shaped this list:
 *
 * 1. Exa rejects a bare suffix with
 *      `400 Domain must include a top-level domain: my`
 *    so `["my"]` or `["id"]` cannot be used. Only registrable suffixes work.
 * 2. A single suffix misses most of the web. `.com.my` alone finds company
 *    sites but skips news, directories and co-operatives, so the list covers the
 *    common second-level spaces as well.
 *
 * The filter is a hard allow-list: a result whose host does not end in one of
 * these is dropped before it reaches the UI, because a search that "mostly"
 * returns local suppliers still shows the wrong country on the first card.
 */

export type SearchCountry = "MY" | "ID";

/** Registrable suffixes, longest first so `com.my` matches before `my`. */
export const COUNTRY_DOMAINS: Record<SearchCountry, readonly string[]> = {
  MY: ["com.my", "net.my", "org.my", "edu.my", "gov.my", "biz.my", "my"],
  ID: ["co.id", "net.id", "or.id", "ac.id", "go.id", "web.id", "biz.id", "id"],
};

/**
 * Suffixes handed to the provider. The bare TLD is included because many
 * Malaysian and Indonesian businesses register directly under `.my` / `.id`.
 *
 * Exa validates each entry, and it accepts `my` when it is accompanied by a
 * proper suffix in the same request? It does not — a bare `my` is rejected
 * outright — so it is filtered out before the call and applied locally only.
 */
export function providerDomains(country: SearchCountry): string[] {
  return COUNTRY_DOMAINS[country].filter((suffix) => suffix.includes("."));
}

export function isSearchCountry(value: string | null | undefined): value is SearchCountry {
  return value === "MY" || value === "ID";
}

/**
 * Whether a result URL belongs to the country.
 *
 * Applied to every result, including ones the provider already filtered: a
 * provider may treat `includeDomains` loosely, and the badge on the card is a
 * promise about where the supplier is.
 */
export function hostMatchesCountry(url: string | null | undefined, country: SearchCountry): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return COUNTRY_DOMAINS[country].some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/** Copy shown when a country-scoped search finds nothing. */
export function emptyMessage(country: SearchCountry): string {
  return country === "ID"
    ? "Tiada pembekal ditemui di kawasan anda. Cuba kata kunci lain."
    : "Tiada pembekal ditemui di kawasan anda. Cuba kata kunci lain.";
}

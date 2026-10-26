import { csvSource } from "./sources/csv";
import { openCorporatesSource } from "./sources/opencorporates";
import type { SupplierSource, SupplierSourceId } from "./types";

export * from "./types";
export { importSuppliers } from "./import";
export { normalizeCountry, normalizeUrl, sourceIsOfficial } from "./normalize";
export { parseSupplierCsv } from "./sources/csv";
export { normalizeOpenCorporates } from "./sources/opencorporates";

/**
 * The adapter registry.
 *
 * Adding a source is: implement `SupplierSource`, add it here. Nothing in the
 * search path or the UI changes, which is the whole point of Linda's decision —
 * we are not betting the product on one government API's availability or price.
 */
export const SOURCES: Record<SupplierSourceId, SupplierSource | null> = {
  seed: null, // written directly by the seed script
  csv: csvSource,
  opencorporates: openCorporatesSource,
  // Placeholder for a local open-data feed (e.g. Indonesia's one-data portal).
  // Left null until there is a real endpoint: an adapter written against a
  // guessed schema is worse than an empty slot.
  opendata: null,
};

export function listSources(): Array<{
  id: SupplierSourceId;
  label: string;
  configured: boolean;
  hint: string | null;
}> {
  return Object.entries(SOURCES)
    .filter(([, source]) => source !== null)
    .map(([id, source]) => ({
      id: id as SupplierSourceId,
      label: source!.label,
      configured: source!.isConfigured(),
      hint: source!.configurationHint(),
    }));
}

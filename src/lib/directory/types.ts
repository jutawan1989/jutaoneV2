/**
 * The Biz-Match data adapter contract.
 *
 * Every source — a CSV upload, OpenCorporates, a local open-data feed, the seed
 * file — implements `SupplierSource` and produces `NormalizedSupplier[]`. Search
 * and UI only ever read the normalised shape and the `supplier_directory` table,
 * so adding or retiring a source is a change in one module and nowhere else.
 *
 * Nothing outside an adapter is allowed to know a source's response format.
 */

/** What a source is allowed to declare about itself. */
export type SupplierSourceId = "seed" | "csv" | "opencorporates" | "opendata";

export type NormalizedSupplier = {
  companyName: string;
  category: string | null;
  location: string | null;
  /** ISO 3166-1 alpha-2, uppercase. */
  country: string;
  contactInfo: Record<string, string>;
  website: string | null;
  source: SupplierSourceId;
  /** Stable identifier inside the source; makes re-imports idempotent. */
  sourceRef: string | null;
  /**
   * Set by the adapter, not by a human. An official registry is verified; a
   * CSV upload is not. The UI badge reads this, so a badge cannot appear on
   * unverified data by accident.
   */
  verified: boolean;
};

export type ImportResult = {
  source: SupplierSourceId;
  fetched: number;
  imported: number;
  updated: number;
  skipped: number;
  /** Why rows were skipped, counted by reason. */
  reasons: Record<string, number>;
  errors: string[];
};

export type SupplierSource = {
  id: SupplierSourceId;
  /** Human label for logs and the admin surface. */
  label: string;
  /**
   * Whether the source can run right now. Checked before any network call so a
   * missing key produces "not configured" rather than an import that fails
   * halfway.
   */
  isConfigured(): boolean;
  /** Why it is not configured, for an actionable message. */
  configurationHint(): string | null;
  /** Fetch and normalise. Must not write to the database. */
  fetch(input: SourceInput): Promise<NormalizedSupplier[]>;
};

export type SourceInput = {
  /** Search term for API sources; ignored by file sources. */
  query?: string;
  /** Maximum rows to fetch, so one call cannot exhaust a rate limit. */
  limit?: number;
};

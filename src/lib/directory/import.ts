import { getSupabase } from "@/lib/db";
import type { ImportResult, NormalizedSupplier, SupplierSourceId } from "./types";

/**
 * Writes normalised suppliers into `supplier_directory`.
 *
 * Upserts on `(source, source_ref)` so re-running an import updates rows instead
 * of duplicating the directory, which is what makes a scheduled sync safe.
 * Rows without a `source_ref` cannot be matched, so they are inserted; the
 * caller decides whether that is acceptable by looking at `skipped`.
 *
 * Returns a result object rather than throwing on a single bad row: one
 * malformed supplier must not abort a 500-row import.
 */
export async function importSuppliers(
  source: SupplierSourceId,
  suppliers: NormalizedSupplier[],
  options: { batchSize?: number } = {},
): Promise<ImportResult> {
  const result: ImportResult = {
    source,
    fetched: suppliers.length,
    imported: 0,
    updated: 0,
    skipped: 0,
    reasons: {},
    errors: [],
  };

  const db = getSupabase();
  if (!db) {
    result.errors.push("supabase_not_configured");
    result.skipped = suppliers.length;
    return result;
  }

  const batchSize = options.batchSize ?? 100;
  for (let start = 0; start < suppliers.length; start += batchSize) {
    const batch = suppliers.slice(start, start + batchSize);

    const rows = batch.map((supplier) => ({
      company_name: supplier.companyName,
      category: supplier.category,
      location: supplier.location,
      country: supplier.country,
      contact_info: supplier.contactInfo,
      website: supplier.website,
      source: supplier.source,
      source_ref: supplier.sourceRef,
      verified: supplier.verified,
      updated_at: new Date().toISOString(),
    }));

    // Split by whether the row can be matched on re-import: PostgREST requires
    // the conflict target to be present for an upsert to dedupe.
    const withRef = rows.filter((row) => row.source_ref !== null);
    const withoutRef = rows.filter((row) => row.source_ref === null);

    if (withRef.length > 0) {
      const { error } = await db
        .from("supplier_directory")
        .upsert(withRef, { onConflict: "source,source_ref", ignoreDuplicates: false });
      if (error) {
        result.errors.push(error.message);
        result.skipped += withRef.length;
      } else {
        result.imported += withRef.length;
      }
    }

    if (withoutRef.length > 0) {
      const { error } = await db.from("supplier_directory").insert(withoutRef);
      if (error) {
        result.errors.push(error.message);
        result.skipped += withoutRef.length;
      } else {
        result.imported += withoutRef.length;
      }
    }
  }

  if (result.skipped > 0) {
    result.reasons.write_failed = result.skipped;
  }
  return result;
}

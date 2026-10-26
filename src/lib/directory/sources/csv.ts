import { makeSupplier } from "../normalize";
import type { NormalizedSupplier, SupplierSource } from "../types";

/**
 * CSV adapter.
 *
 * The fallback that always works: no API, no key, no rate limit. A merchant
 * association can hand over a spreadsheet and the directory fills up.
 *
 * Parsing is deliberately small rather than a dependency: the format is a flat
 * table with a header row, quoted fields are supported, and anything it cannot
 * understand is reported rather than silently dropped.
 */

const EXPECTED_HEADERS = [
  "company_name",
  "category",
  "location",
  "country",
  "phone",
  "email",
  "website",
];

/** Splits one CSV line, honouring double-quoted fields with embedded commas. */
function splitRow(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      out.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  out.push(field);
  return out.map((value) => value.trim());
}

export type ParseOutcome = {
  suppliers: NormalizedSupplier[];
  /** Rows rejected with the reason, so an importer can report it. */
  rejected: Array<{ line: number; reason: string }>;
};

export function parseSupplierCsv(text: string): ParseOutcome {
  const suppliers: NormalizedSupplier[] = [];
  const rejected: Array<{ line: number; reason: string }> = [];

  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return { suppliers, rejected };

  const header = splitRow(lines[0]).map((name) => name.toLowerCase());
  const hasHeader = header.includes("company_name");
  if (!hasHeader) {
    rejected.push({
      line: 1,
      reason: `missing company_name header; expected: ${EXPECTED_HEADERS.join(", ")}`,
    });
    return { suppliers, rejected };
  }

  const index = (name: string) => header.indexOf(name);

  for (let i = 1; i < lines.length; i += 1) {
    const row = splitRow(lines[i]);
    const get = (name: string) => {
      const at = index(name);
      return at >= 0 ? (row[at] ?? "") : "";
    };

    const contactInfo: Record<string, string> = {};
    if (get("phone")) contactInfo.phone = get("phone");
    if (get("email")) contactInfo.email = get("email");

    const supplier = makeSupplier({
      companyName: get("company_name"),
      category: get("category"),
      location: get("location"),
      country: get("country"),
      contactInfo,
      website: get("website"),
      source: "csv",
      // A spreadsheet has no stable id, so the normalised name is used: importing
      // the same file twice updates rows instead of duplicating the directory.
      sourceRef: get("company_name").trim().toLowerCase() || null,
      // A hand-maintained spreadsheet is not an official record.
      verified: false,
    });

    if (supplier) {
      suppliers.push(supplier);
    } else {
      rejected.push({ line: i + 1, reason: "empty or unusable company_name" });
    }
  }

  return { suppliers, rejected };
}

/** File sources are driven by an upload, not by a fetch; the interface still
 *  needs a shape, so `fetch` explains that it has no remote endpoint. */
export const csvSource: SupplierSource = {
  id: "csv",
  label: "CSV upload",
  isConfigured() {
    return true;
  },
  configurationHint() {
    return null;
  },
  async fetch() {
    throw new Error("CSV is imported from an uploaded file, not fetched from a URL");
  },
};

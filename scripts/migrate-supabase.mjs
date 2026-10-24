#!/usr/bin/env node
/**
 * Applies `supabase/schema.sql` to a Supabase project and verifies the result.
 *
 * Idempotent: the schema uses IF NOT EXISTS / CREATE OR REPLACE, so running it
 * twice is safe. That is what makes a region move cheap — point it at the new
 * project and run it once.
 *
 * Usage:
 *   node scripts/migrate-supabase.mjs            # apply schema
 *   node scripts/migrate-supabase.mjs --verify   # apply, then assert the result
 *
 * Reads credentials from `.env.local` (gitignored):
 *   SUPABASE_ACCESS_TOKEN  — management token (not the service role key)
 *   SUPABASE_PROJECT_REF   — project ref, e.g. ddpqmdaqgztyezauuqwq
 *
 * Secrets are read from the file, never from argv, so they do not leak into
 * shell history or process listings.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(repoRoot, ".env.local");

const REQUESTED_TABLES = ["demo_attempts", "ai_usage", "events", "topups"];

function loadEnv(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Cannot read ${path}. Copy .env.example to .env.local first.`);
  }
  const values = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    values[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return values;
}

const env = loadEnv(envPath);
const token = env.SUPABASE_ACCESS_TOKEN;
const ref = env.SUPABASE_PROJECT_REF;

if (!token || !ref) {
  console.error("SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF must be set in .env.local");
  process.exit(1);
}

async function query(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
}

async function projectRegion() {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return "unknown";
  const project = await response.json();
  return project.region ?? "unknown";
}

function report(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) process.exitCode = 1;
}

const schema = readFileSync(join(repoRoot, "supabase", "schema.sql"), "utf8");

const region = await projectRegion();
console.log(`project ${ref} region ${region}`);
if (region !== "ap-southeast-1") {
  console.warn(
    `WARNING: region is ${region}, not ap-southeast-1 (Singapore). ` +
      "PDPA / UU PDP requires Singapore hosting.",
  );
}

console.log("applying supabase/schema.sql ...");
await query(schema);
console.log("schema applied");

if (!process.argv.includes("--verify")) {
  process.exit(process.exitCode ?? 0);
}

console.log("\nverifying ...");

const tables = await query(`
  select tablename, rowsecurity
  from pg_tables
  where schemaname = 'public'
  order by tablename;
`);

const names = tables.map((row) => row.tablename);
for (const table of REQUESTED_TABLES) {
  const row = tables.find((entry) => entry.tablename === table);
  report(`table ${table} exists`, Boolean(row));
  if (row) report(`table ${table} has RLS enabled`, row.rowsecurity === true);
}

const unexpected = names.filter((name) => !REQUESTED_TABLES.includes(name));
if (unexpected.length > 0) {
  console.log(`note  other public tables present: ${unexpected.join(", ")}`);
}

const functions = await query(`
  select proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and proname = 'jutaone_daily_cost';
`);
report("function jutaone_daily_cost exists", functions.length === 1);

const costCheck = await query("select public.jutaone_daily_cost(current_date) as spent;");
report(
  "jutaone_daily_cost is callable",
  Array.isArray(costCheck) && costCheck.length === 1,
  `spent=${costCheck?.[0]?.spent}`,
);

const indexes = await query(`
  select indexname from pg_indexes
  where schemaname = 'public'
  order by indexname;
`);
const indexNames = indexes.map((row) => row.indexname);
for (const expected of [
  "demo_attempts_visitor_key_idx",
  "demo_attempts_device_hash_idx",
  "ai_usage_day_idx",
  "events_name_idx",
  "events_created_at_idx",
  "events_variant_idx",
  "events_locale_idx",
]) {
  report(`index ${expected} exists`, indexNames.includes(expected));
}

console.log(`\n${process.exitCode === 1 ? "verification FAILED" : "verification passed"}`);

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
import { dirname, join, relative } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(repoRoot, ".env.local");

const REQUESTED_TABLES = [
  "demo_attempts",
  "ai_usage",
  "events",
  "topups",
  "fx_rates",
  "token_ledger",
];

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

const schemaFiles = [
  join(repoRoot, "supabase", "schema.sql"),
  join(repoRoot, "supabase", "fx.sql"),
  join(repoRoot, "supabase", "token_ledger.sql"),
];

const region = await projectRegion();
console.log(`project ${ref} region ${region}`);
if (region !== "ap-southeast-1") {
  console.warn(
    `WARNING: region is ${region}, not ap-southeast-1 (Singapore). ` +
      "PDPA / UU PDP requires Singapore hosting.",
  );
}

for (const file of schemaFiles) {
  console.log(`applying ${relative(repoRoot, file)} ...`);
  await query(readFileSync(file, "utf8"));
}
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
  where n.nspname = 'public';
`);
report(
  "function jutaone_daily_cost exists",
  functions.some((row) => row.proname === "jutaone_daily_cost"),
);

const costCheck = await query("select public.jutaone_daily_cost(current_date) as spent;");
report(
  "jutaone_daily_cost is callable",
  Array.isArray(costCheck) && costCheck.length === 1,
  `spent=${costCheck?.[0]?.spent}`,
);

report(
  "function jutaone_latest_fx_rate exists",
  functions.some((row) => row.proname === "jutaone_latest_fx_rate"),
);

report(
  "function jutaone_token_balance exists",
  functions.some((row) => row.proname === "jutaone_token_balance"),
);

report(
  "function jutaone_guard_ledger exists",
  functions.some((row) => row.proname === "jutaone_guard_ledger"),
);

const ledgerIndex = await query(`
  select indexname from pg_indexes
   where schemaname = 'public' and tablename = 'token_ledger';
`);
report(
  "top-up grant is unique (double-credit guard)",
  (ledgerIndex ?? []).some((row) => row.indexname === "token_ledger_topup_grant_key"),
);

// Every chargeable currency needs a usable rate, or checkout would quote a free
// top-up. A zero or negative rate is rejected by the table constraint, but a
// missing row would silently fall through to the env fallback at runtime — so it
// is reported here instead.
const fxCheck = await query(`
  select c.currency, public.jutaone_latest_fx_rate(c.currency) as rate
  from (values ('MYR'), ('IDR')) as c(currency);
`);
for (const row of fxCheck ?? []) {
  const rate = Number(row.rate);
  report(`fx rate for ${row.currency}`, Number.isFinite(rate) && rate > 0, `rate=${row.rate}`);
}

// The USD base has to survive the round trip through the local currency.
const roundTrip = await query(`
  select public.jutaone_latest_fx_rate('MYR') as myr,
         public.jutaone_latest_fx_rate('IDR') as idr;
`);
const { myr, idr } = roundTrip?.[0] ?? {};
report(
  "USD base converts to a chargeable local amount",
  Number(myr) > 0 && Number(idr) > 0,
  `$1.00 = RM${(1 * Number(myr)).toFixed(2)} = Rp${Math.round(1 * Number(idr)).toLocaleString("en-US")}`,
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

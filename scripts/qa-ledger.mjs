#!/usr/bin/env node
/**
 * Adversarial QA for the token ledger.
 *
 * Applies `supabase/token_ledger.sql`, runs `supabase/token_ledger.qa.sql`
 * (which asserts verdicts into a temp table), prints them, then removes every
 * row the QA created.
 *
 * Usage: node scripts/qa-ledger.mjs
 * Reads `.env.local` (gitignored).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(path) {
  const values = {};
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return values;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    values[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return values;
}

const env = loadEnv(join(repoRoot, ".env.local"));
const token = env.SUPABASE_ACCESS_TOKEN;
const ref = env.SUPABASE_PROJECT_REF;

if (!token || !ref) {
  console.error("SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF must be set in .env.local");
  process.exit(1);
}

async function query(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

for (const name of ["supabase/token_ledger.sql", "supabase/token_ledger.qa.sql"]) {
  const file = join(repoRoot, name);
  console.log(`applying ${relative(repoRoot, file)} ...`);
  await query(readFileSync(file, "utf8"));
}

const results = await query("select step, name, ok, detail from _tl_results order by step;");

let failures = 0;
for (const row of results) {
  if (!row.ok) failures += 1;
  console.log(`${row.ok ? "PASS" : "FAIL"}  ${row.name}${row.detail ? `\n      ${row.detail}` : ""}`);
}

// Clean up before reporting, so a failing assertion cannot leave fixtures behind.
await query(`
  delete from public.token_ledger where visitor_key like 'qa-ledger-%';
  delete from public.topups where provider = 'qa-ledger';
  drop table if exists _tl_results;
`);
console.log("\nfixtures removed");

const leftovers = await query(`
  select
    (select count(*) from public.token_ledger where visitor_key like 'qa-ledger-%') as ledger,
    (select count(*) from public.topups where provider = 'qa-ledger') as topups,
    (select count(*) from public.token_ledger) as all_ledger;
`);
const remaining = leftovers?.[0] ?? {};
const dirty = Number(remaining.ledger) !== 0 || Number(remaining.topups) !== 0;
console.log(`leftover qa rows: ${JSON.stringify(remaining)}${dirty ? "  <- NOT CLEAN" : ""}`);

console.log(`\n${results.length - failures}/${results.length} ledger guard checks passed`);
if (failures > 0 || dirty) process.exitCode = 1;

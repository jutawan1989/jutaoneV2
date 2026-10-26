#!/usr/bin/env node
/**
 * Adversarial QA for Auto-Store & Invoice.
 *
 * Applies `supabase/store.sql`, runs `supabase/store.qa.sql`, prints the
 * verdicts, then removes every fixture it created.
 *
 * Usage: node scripts/qa-store.mjs
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

for (const name of ["supabase/store.sql", "supabase/store.qa.sql"]) {
  console.log(`applying ${relative(repoRoot, name)} ...`);
  await query(readFileSync(join(repoRoot, name), "utf8"));
}

const results = await query("select step, name, ok, detail from _st_results order by step;");

let failures = 0;
for (const row of results) {
  if (!row.ok) failures += 1;
  console.log(`${row.ok ? "PASS" : "FAIL"}  ${row.name}${row.detail ? `\n      ${row.detail}` : ""}`);
}

await query(`
  delete from public.merchant_orders where shop_slug like 'qa-shop%';
  delete from public.merchant_products where owner_ref like 'qa-store-%';
  drop table if exists _st_results;
`);
console.log("\nfixtures removed");

const leftovers = await query(`
  select
    (select count(*) from public.merchant_products where owner_ref like 'qa-store-%') as products,
    (select count(*) from public.merchant_orders where shop_slug like 'qa-shop%') as orders;
`);
const remaining = leftovers?.[0] ?? {};
const dirty = Number(remaining.products) !== 0 || Number(remaining.orders) !== 0;
console.log(`leftover qa rows: ${JSON.stringify(remaining)}${dirty ? "  <- NOT CLEAN" : ""}`);

console.log(`\n${results.length - failures}/${results.length} store guard checks passed`);
if (failures > 0 || dirty) process.exitCode = 1;

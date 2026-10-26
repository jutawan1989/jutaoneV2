#!/usr/bin/env node
/**
 * Adversarial QA for the 19-level affiliate matrix.
 *
 * Applies `supabase/affiliate_matrix.sql`, runs the QA SQL, prints verdicts and
 * removes every fixture. Also asserts the matrix arithmetic independently of
 * the database, so a typo in either place is caught.
 *
 * Usage: node scripts/qa-matrix.mjs
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
    const i = trimmed.indexOf("=");
    values[trimmed.slice(0, i)] = trimmed.slice(i + 1);
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

// --- arithmetic check, independent of the database -------------------------
const LEVELS = [
  [1, 50], [2, 4], [3, 3], [4, 2], [5, 1],
  ...Array.from({ length: 5 }, (_, i) => [6 + i, 0.5]),
  ...Array.from({ length: 5 }, (_, i) => [11 + i, 0.3]),
  ...Array.from({ length: 4 }, (_, i) => [16 + i, 0.25]),
];
const direct = LEVELS.reduce((sum, [, pct]) => sum + pct, 0);
const milestone = 5;
const ok = Math.abs(direct + milestone - 70) < 1e-9;
console.log(
  `${ok ? "PASS" : "FAIL"}  matrix arithmetic: ${LEVELS.length} levels pay ${direct}%, ` +
    `+ ${milestone}% milestone = ${direct + milestone}% (company ${100 - (direct + milestone)}%)`,
);
if (!ok) process.exitCode = 1;

// --- database checks -------------------------------------------------------
for (const name of ["supabase/affiliate_matrix.sql", "supabase/affiliate_matrix.qa.sql"]) {
  console.log(`applying ${relative(repoRoot, name)} ...`);
  await query(readFileSync(join(repoRoot, name), "utf8"));
}

const results = await query("select step, name, ok, detail from _mx_results order by step;");
let failures = ok ? 0 : 1;
for (const row of results) {
  if (!row.ok) failures += 1;
  console.log(`${row.ok ? "PASS" : "FAIL"}  ${row.name}${row.detail ? `\n      ${row.detail}` : ""}`);
}

await query(`
  delete from public.affiliate_earnings where referred_code_id is not null;
  delete from public.milestone_pool;
  delete from public.referral_codes where code like 'mx-%';
  delete from public.store_subscriptions where owner_ref in ('mx-buyer', 'mx-buyer-short');
  drop table if exists _mx_results;
`);
console.log("\nfixtures removed");

const left = await query(`
  select (select count(*) from public.referral_codes where code like 'mx-%') as codes,
         (select count(*) from public.milestone_pool) as pools,
         (select count(*) from public.affiliate_earnings) as earnings;
`);
const rem = left?.[0] ?? {};
const dirty = Object.values(rem).some((v) => Number(v) !== 0);
console.log(`leftover: ${JSON.stringify(rem)}${dirty ? "  <- NOT CLEAN" : ""}`);

const total = results.length + 1;
console.log(`\n${total - failures}/${total} matrix checks passed`);
if (failures > 0 || dirty) process.exitCode = 1;

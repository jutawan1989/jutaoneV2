#!/usr/bin/env node
/**
 * Adversarial QA for the Phase 2 affiliate schema.
 *
 * Applies `supabase/affiliate.sql`, runs `supabase/affiliate.qa.sql` (which
 * asserts its verdicts into a temp table), prints them, then removes every row
 * the QA created so staging is left exactly as it was found.
 *
 * Usage: node scripts/qa-affiliate.mjs
 * Reads `.env.local` (gitignored) for the management token and project ref.
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

for (const name of ["supabase/affiliate.sql", "supabase/affiliate.qa.sql"]) {
  const file = join(repoRoot, name);
  console.log(`applying ${relative(repoRoot, file)} ...`);
  await query(readFileSync(file, "utf8"));
}

const results = await query("select step, name, ok, detail from _af_results order by step;");

let failures = 0;
for (const row of results) {
  const label = row.ok ? "PASS" : "FAIL";
  if (!row.ok) failures += 1;
  console.log(`${label}  ${row.name}${row.detail ? `\n      ${row.detail}` : ""}`);
}

// Clean up before reporting, so a failing assertion cannot leave fixtures behind.
await query(`
  delete from public.affiliate_earnings where topup_id in (
    select id from public.topups where provider = 'qa-affiliate'
  );
  delete from public.payout_requests where referral_code_id in (
    select id from public.referral_codes where owner_ref = 'qa-owner'
  );
  delete from public.topups where provider = 'qa-affiliate';
  delete from public.referral_codes where owner_ref = 'qa-owner';
  drop table if exists _af_results;
`);
console.log("\nfixtures removed");

const leftovers = await query(`
  select
    (select count(*) from public.referral_codes where owner_ref = 'qa-owner') as codes,
    (select count(*) from public.topups where provider = 'qa-affiliate') as topups,
    (select count(*) from public.affiliate_earnings) as earnings,
    (select count(*) from public.payout_requests) as payouts;
`);
const remaining = leftovers?.[0] ?? {};
const dirty = Object.values(remaining).some((value) => Number(value) !== 0);
console.log(`leftover rows: ${JSON.stringify(remaining)}${dirty ? "  <- NOT CLEAN" : ""}`);

console.log(`\n${results.length - failures}/${results.length} affiliate guard checks passed`);
if (failures > 0 || dirty) process.exitCode = 1;

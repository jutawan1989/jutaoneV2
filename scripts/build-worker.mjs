#!/usr/bin/env node
/**
 * Builds the Cloudflare Worker bundle WITHOUT any secrets in it.
 *
 * Why this exists: OpenNext copies the whole of `.env.local` into
 * `.open-next/cloudflare/next-env.mjs`, which is bundled into the worker. Those
 * values then live inside the deployed script (they act as a fallback behind
 * Worker secrets, so even rotated keys stay embedded). Building with only the
 * public vars present keeps every secret out of the artefact.
 *
 * Runtime secrets are supplied separately with `wrangler secret put`.
 *
 * Usage:
 *   node scripts/build-worker.mjs          # build
 *   node scripts/build-worker.mjs --check  # build, then scan for leaks
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(repoRoot, ".env.local");
const holdPath = join(repoRoot, ".env.local.hold");

/** Only these are safe to embed: they are public by definition. */
const PUBLIC_PREFIXES = ["NEXT_PUBLIC_"];

function parseEnv(text) {
  const values = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    values[t.slice(0, i)] = t.slice(i + 1);
  }
  return values;
}

if (!existsSync(envPath)) {
  console.error(".env.local not found");
  process.exit(1);
}

const fullEnv = parseEnv(readFileSync(envPath, "utf8"));
const publicVars = Object.entries(fullEnv).filter(([key]) =>
  PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix)),
);

if (publicVars.length === 0) {
  console.error("no NEXT_PUBLIC_* vars found in .env.local");
  process.exit(1);
}

let exitCode = 0;
try {
  // Hide the real file, then expose only the public vars for the build.
  copyFileSync(envPath, holdPath);
  writeFileSync(
    envPath,
    `# Temporary build-time env: public vars only. Restored by scripts/build-worker.mjs.\n` +
      publicVars.map(([key, value]) => `${key}=${value}`).join("\n") +
      "\n",
  );

  console.log(`building with ${publicVars.length} public var(s): ${publicVars.map(([k]) => k).join(", ")}`);

  const build = spawnSync("npx", ["opennextjs-cloudflare", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, PATH: `/home/coder/.local/node/bin:${process.env.PATH}` },
  });
  if (build.status !== 0) {
    throw new Error(`opennextjs-cloudflare build failed with ${build.status}`);
  }
} finally {
  // Always put the real env back, even if the build throws.
  if (existsSync(holdPath)) {
    copyFileSync(holdPath, envPath);
    rmSync(holdPath);
    console.log("restored .env.local");
  }
}

// Verify the artefact holds no secrets.
const publicValues = publicVars.map(([, value]) => value);

/**
 * A value is not a leak when it is already public, or derivable from something
 * public: the Supabase project URL is both NEXT_PUBLIC_ and the same string as
 * SUPABASE_URL, and the project ref is a substring of that URL.
 */
function isDerivableFromPublic(value) {
  return publicValues.some((publicValue) => publicValue.includes(value));
}

const secretValues = Object.entries(fullEnv)
  .filter(([key]) => !PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix)))
  .filter(([, value]) => typeof value === "string" && value.length >= 16)
  .filter(([, value]) => !isDerivableFromPublic(value));

const bundleFiles = [
  ".open-next/cloudflare/next-env.mjs",
  ".open-next/worker.js",
];

const leaks = [];
for (const relative of bundleFiles) {
  const absolute = join(repoRoot, relative);
  if (!existsSync(absolute)) continue;
  const contents = readFileSync(absolute, "utf8");
  for (const [key, value] of secretValues) {
    if (contents.includes(value)) leaks.push(`${key} -> ${relative}`);
  }
}

// Public assets are served to every visitor, so they must never hold secrets.
const assetsDir = join(repoRoot, ".open-next/assets");
if (existsSync(assetsDir)) {
  const scan = spawnSync("grep", ["-rlF", ...secretValues.map(([, v]) => `-e${v}`), assetsDir], {
    encoding: "utf8",
  });
  if (scan.status === 0 && scan.stdout.trim()) {
    for (const file of scan.stdout.trim().split("\n")) {
      leaks.push(`secret in public asset -> ${file}`);
    }
  }
}

if (leaks.length > 0) {
  console.error("\nSECRET LEAK in the worker bundle:");
  for (const leak of leaks) console.error(`  ${leak}`);
  exitCode = 1;
} else {
  console.log(`\nno secrets in the worker bundle (checked ${secretValues.length} sensitive values)`);
}

process.exit(exitCode);

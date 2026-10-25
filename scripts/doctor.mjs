#!/usr/bin/env node
/**
 * Integration health check. Probes every external service the app depends on
 * and prints a pass/fail line for each, with secrets masked.
 *
 * Purpose: after credentials are rotated or a region move is done, one command
 * tells us what is actually working before we deploy.
 *
 * Usage: node scripts/doctor.mjs
 * Reads `.env.local` (gitignored). Never prints a full secret.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

const results = [];
/**
 * Levels: pass | warn | fail. `warn` means a known, accepted exception — it is
 * still printed with its reason and is not counted as a pass, so the output
 * cannot be read as "everything is compliant".
 */
function record(area, level, detail) {
  results.push({ area, level, detail });
}

async function probe(area, fn) {
  try {
    const { ok, detail, warn } = await fn();
    record(area, warn ? "warn" : ok ? "pass" : "fail", detail);
  } catch (error) {
    record(area, "fail", error.message.slice(0, 160));
  }
}

// --- required vars ---------------------------------------------------------
const REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VISITOR_HASH_SALT",
  "CHIP_API_KEY",
  "CHIP_PUBLIC_KEY",
  "META_AI_API_KEY",
  "META_AI_BASE_URL",
  "META_AI_MODEL",
];
// Optional while Chip.Asia brand approval is pending: top-up stays in sandbox.
const PENDING = ["CHIP_BRAND_ID"];

const missing = REQUIRED.filter((key) => !env[key]);
record(
  "env: required vars",
  missing.length === 0 ? "pass" : "fail",
  missing.length === 0 ? "all present" : `missing ${missing.join(", ")}`,
);

const pending = PENDING.filter((key) => !env[key]);
record(
  "env: pending vars",
  pending.length === 0 ? "pass" : "warn",
  pending.length === 0 ? "all present" : `awaiting approval: ${pending.join(", ")} (top-up stays sandbox)`,
);

const salt = env.VISITOR_HASH_SALT ?? "";
record(
  "env: visitor salt strength",
  salt.length >= 16 ? "pass" : "fail",
  salt.length >= 16 ? `${salt.length} chars` : "too short, use 32+ random chars",
);

// Canonical/hreflang/robots/sitemap/Chip redirects are all derived from this,
// so a wrong value silently misconfigures every public URL.
await probe("env: public site url", async () => {
  const raw = env.NEXT_PUBLIC_SITE_URL ?? "";
  if (!raw) return { ok: false, detail: "not set — canonical URLs will fall back to localhost" };
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, detail: `not a valid URL: ${raw}` };
  }
  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    return { ok: false, detail: `${raw} is local, not a staging origin` };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, detail: `${raw} must use https` };
  }
  return { ok: true, detail: raw };
});

// --- GitHub ----------------------------------------------------------------
await probe("github: token + repo", async () => {
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}`, {
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "user-agent": "jutaone-doctor",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
  const data = await response.json();
  return { ok: true, detail: `${env.GITHUB_REPO} default=${data.default_branch}` };
});

// --- Supabase --------------------------------------------------------------
await probe("supabase: region (PDPA / UU PDP)", async () => {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}`,
    {
      headers: { authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
  const project = await response.json();
  const inSingapore = project.region === "ap-southeast-1";
  if (inSingapore) {
    return { ok: true, detail: `${project.name} region=${project.region}` };
  }
  const accepted = env.DOCTOR_ACCEPT_REGION === "1";
  return {
    ok: false,
    // Accepted for staging only; never reported as a pass.
    warn: accepted,
    detail:
      `${project.name} region=${project.region} — ` +
      (accepted
        ? "accepted for STAGING ONLY, must move to ap-southeast-1 before public launch"
        : "must be ap-southeast-1"),
  };
});

await probe("supabase: service role key", async () => {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/events?select=id&limit=1`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 404) return { ok: false, detail: "events table missing — run npm run migrate" };
  return { ok: response.ok, detail: `HTTP ${response.status}` };
});

// --- Meta AI ---------------------------------------------------------------
await probe("meta ai: key + billing", async () => {
  const base = (env.META_AI_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.META_AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.META_AI_MODEL,
      max_tokens: 5,
      messages: [{ role: "user", content: "hi" }],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (response.ok) return { ok: true, detail: `model ${env.META_AI_MODEL}` };
  const body = await response.text();
  let reason = `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(body);
    if (parsed?.error?.code === "billing_not_configured") {
      reason = "HTTP 402 billing not configured — demo falls back to local templates";
    }
  } catch {
    // keep the status code
  }
  return { ok: false, detail: reason };
});

// --- OpenRouter ------------------------------------------------------------
// Probed with the real caption settings: reasoning disabled and the configured
// token budget. A shallow probe would report a model as working when it would
// actually spend its whole budget thinking and return no caption.
await probe("openrouter: key + real caption", async () => {
  if (!env.OPENROUTER_API_KEY) {
    return { ok: false, warn: true, detail: "no key — provider skipped, template used" };
  }
  if (env.OPENROUTER_ENABLED === "0") {
    return { ok: false, warn: true, detail: "OPENROUTER_ENABLED=0 — provider skipped" };
  }
  const base = (env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const startedAt = Date.now();
  const body = {
    model: env.OPENROUTER_MODEL || "dots-studio/dots-3-note-preview:free",
    max_tokens: Number(env.OPENROUTER_MAX_TOKENS) || 400,
    messages: [
      {
        role: "user",
        content:
          "You write short marketing captions. Output one 20-word caption for a cake shop in Malay. No explanation.",
      },
    ],
  };
  if (env.OPENROUTER_REASONING !== "on") body.reasoning = { enabled: false };

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const elapsed = Date.now() - startedAt;
  if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
  const payload = await response.json();
  const caption = payload?.choices?.[0]?.message?.content ?? "";
  if (!caption.trim()) {
    const reasoning = payload?.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    return {
      ok: false,
      detail: `HTTP 200 but no caption (reasoning_tokens=${reasoning}) — reasoning is on, raise OPENROUTER_MAX_TOKENS`,
    };
  }
  return {
    ok: true,
    // Latency is part of the verdict: the brief is 1-2s, so a slow model is a
    // warning even when it technically answers.
    warn: elapsed > 4000,
    detail:
      `model ${env.OPENROUTER_MODEL} caption in ${(elapsed / 1000).toFixed(1)}s` +
      (elapsed > 4000 ? " — slower than the 1-2s brief" : ""),
  };
});

// --- Chip.Asia -------------------------------------------------------------
await probe("chip: api key + brand", async () => {
  if (!env.CHIP_BRAND_ID) {
    return { ok: false, warn: true, detail: "CHIP_BRAND_ID pending approval — top-up stays sandbox" };
  }
  const base = (env.CHIP_API_BASE_URL || "https://gate.chip-in.asia/api/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/purchases/`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.CHIP_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      brand_id: env.CHIP_BRAND_ID,
      reference: `JO-DOCTOR-${Date.now()}`,
      client: { email: env.CHIP_TEST_EMAIL || "sandbox@jutaone.biz" },
      purchase: { currency: "MYR", products: [{ name: "probe", price: 100, quantity: 1 }] },
      success_redirect: "https://example.com/ok",
      failure_redirect: "https://example.com/fail",
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (response.ok) {
    const data = await response.json();
    return { ok: true, detail: `checkout created ${data.id ?? ""}`.trim() };
  }
  const body = await response.text();
  const notFound = body.includes("brand_not_found");
  return { ok: false, detail: notFound ? "brand_id rejected by Chip" : `HTTP ${response.status}` };
});

// --- Cloudflare ------------------------------------------------------------
await probe("cloudflare: api token", async () => {
  const response = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
    signal: AbortSignal.timeout(20000),
  });
  if (response.ok) return { ok: true, detail: "token valid" };
  const body = await response.text();
  return {
    ok: false,
    detail: body.includes("Invalid API Token")
      ? "HTTP 401 invalid token — needs Workers Scripts: Edit"
      : `HTTP ${response.status}`,
  };
});

// --- report ----------------------------------------------------------------
const label = { pass: "PASS", warn: "WARN", fail: "FAIL" };
const failures = results.filter((entry) => entry.level === "fail").length;
const warnings = results.filter((entry) => entry.level === "warn").length;
const passes = results.filter((entry) => entry.level === "pass").length;

for (const entry of results) {
  console.log(`${label[entry.level]}  ${entry.area} — ${entry.detail}`);
}

console.log(`\n${passes}/${results.length} passed, ${warnings} warning(s), ${failures} failed`);
if (warnings > 0) console.log("WARN items are accepted for staging and must be resolved before public launch.");
if (failures > 0) process.exitCode = 1;

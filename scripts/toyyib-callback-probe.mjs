// ToyyibPay callback replay probe — scripts/toyyib-callback-probe.mjs
//
// Replays a real (or synthetic) ToyyibPay server callback against the live
// `POST /api/topup/toyyib-callback` endpoint so a Boss sandbox payment can be
// diagnosed without waiting for ToyyibPay to re-fire the webhook.
//
// Usage:
//   1. From the ToyyibPay sandbox dashboard (dev.toyyibpay.com), open the
//      paid bill and copy: refno, order_id, billcode, amount, status.
//   2. node scripts/toyyib-callback-probe.mjs \
//        --billcode XXX --refno YYY --order-id 'JO-...' --amount 5.70 \
//        --status 1 [--secret SANDBOX_SECRET] [--target production|staging]
//
// The MD5 hash is computed with the OFFICIAL formula
// (https://toyyibpay.com/apireference/):
//   MD5(userSecretKey + status + order_id + refno + "ok")
// so a replayed callback carries a valid signature — the server's Layer 1
// check must pass, and any failure is isolated to Layer 2
// (getBillTransactions) or the Supabase write.
//
// WITHOUT --secret the probe sends hash=0*32, which isolates Layer 1:
//   expect 401 { ok:false, code:"invalid_hash" }.
// WITH --secret the probe expects either:
//   200 { ok:true, recorded, credited }   — full path works, or
//   401 { ok:false, code:"no matching paid transaction" | ... } — hash OK,
//   vendor check or DB failed (reason printed from the body).
//
// Exit codes: 0 = probe ran and classified the failure layer,
//             2 = bad CLI usage, 1 = network/unexpected error.
import { createHash } from "node:crypto";

const TARGETS = {
  production: "https://jutaone.biz/api/topup/toyyib-callback",
  staging: "https://jutaonev2.jutawan1989.workers.dev/api/topup/toyyib-callback",
};

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function usage() {
  console.error(
    [
      "Usage: node scripts/toyyib-callback-probe.mjs --billcode X --refno Y",
      "  --order-id 'JO-...' --amount 5.70 [--status 1]",
      "  [--secret SANDBOX_SECRET] [--target production|staging]",
      "",
      "Without --secret: Layer-1 probe (invalid hash -> expect 401 invalid_hash).",
      "With --secret: full replay (official MD5 formula) -> 200 or Layer-2 reason.",
    ].join("\n"),
  );
}

const billcode = arg("billcode");
const refno = arg("refno");
const orderId = arg("order-id");
const amount = arg("amount");
const status = arg("status", "1");
const secret = arg("secret");
const target = arg("target", "production");

if (!billcode || !refno || !orderId || !amount || !TARGETS[target]) {
  usage();
  process.exit(2);
}

// Official vendor formula — the exact order matters.
const hash = secret
  ? createHash("md5").update(secret + status + orderId + refno + "ok").digest("hex")
  : "0".repeat(32);

const body = new URLSearchParams({
  refno,
  status,
  order_id: orderId,
  billcode,
  amount,
  hash,
});

const url = TARGETS[target];
console.log(`POST ${url}`);
console.log(`billcode=${billcode} refno=${refno} status=${status} amount=${amount}`);
console.log(`order_id=${orderId}`);
console.log(`hash=${secret ? `${hash} (computed, MD5(secret+status+order_id+refno+"ok"))` : `${hash} (dummy — Layer-1 probe only)`}`);

let response;
try {
  response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(30_000),
  });
} catch (error) {
  console.error(`NETWORK ERROR: ${error.message}`);
  console.error("Layer: unreachable (endpoint/TLS/network) — not a hash, vendor, or DB issue.");
  process.exit(1);
}

const text = await response.text().catch(() => "");
console.log(`\nHTTP ${response.status}`);
console.log(text || "(empty body)");

let parsed = null;
try {
  parsed = JSON.parse(text);
} catch {
  // Non-JSON body — report raw.
}

if (response.status === 400 && parsed?.code === "missing_refno") {
  console.log("\nLayer: parsing (400 missing_refno) — form fields did not arrive.");
} else if (response.status === 401 && parsed?.code === "missing_hash") {
  console.log("\nLayer: signature (401 missing_hash) — replay omitted the hash; ToyyibPay always sends one.");
} else if (response.status === 401 && parsed?.code === "invalid_hash") {
  console.log("\nLayer: signature (401 invalid_hash) — wrong secret or wrong field order in the MD5 input.");
} else if (response.status === 401) {
  console.log(`\nLayer: vendor/DB gate (401 ${parsed?.code ?? "unknown"}) — hash passed, Layer 2 or Supabase refused. Check wrangler tail / console.`);
} else if (response.status === 200 && parsed?.ok) {
  console.log(`\nResult: accepted. recorded=${parsed.recorded} credited=${parsed.credited} tokens=${parsed.tokens ?? "-"} replayed=${parsed.replayed ?? false}`);
  if (parsed.recorded && !parsed.credited) {
    console.log(`Credit skipped: ${parsed.reason ?? "unknown"} — Supabase recorded the bill but no ledger row was written.`);
  }
} else {
  console.log(`\nUNEXPECTED: HTTP ${response.status} — paste this body for diagnosis.`);
}

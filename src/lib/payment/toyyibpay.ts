import { createHash } from "node:crypto";
import type { Locale, Region } from "@/lib/i18n/config";
import type { Variant } from "@/lib/analytics/variant";
import { parseTopUpAmount, type Price } from "@/lib/pricing";

/**
 * ToyyibPay adapter — Malaysia gateway (FPX + DuitNow QR).
 *
 * Official docs: https://toyyibpay.com/apireference/
 * Payment flow: createBill (urlencoded POST) -> BillCode -> redirect the
 * payer to `https://toyyibpay.com/{BillCode}`. ToyyibPay POSTs the result to
 * `billCallbackUrl`; the payer returns via `billReturnUrl`.
 *
 * Key facts that shape this adapter:
 * - Bill name/description allow alphanumeric + space + underscore only, max
 *   30 / 100 chars. Our product name is normalised before sending.
 * - Bill amount is in SEN (100 = RM1.00): whole-sen RM5.70 -> 570.
 * - createBill answers HTTP 200 for BOTH success and failure. Success is a
 *   JSON array `[{ BillCode }]`. Failures are either `{ status: error,
 *   msg }` or a plain-text bracket code like [KEY-DID-NOT-EXIST]:
 *   NEVER trust the HTTP status alone, always inspect the body.
 * - `billPaymentChannel`: 0 = FPX, 2 = FPX + credit card. Boss spec is
 *   FPX & DuitNow QR, so channel 0 + enableDuitNowQR=1 + chargeDuitNowQR=0
 *   (fee on bill owner) mirrors the FPX owner-pays posture here.
 * - The callback carries `refno` (ToyyibPay's payment reference), `order_id`
 *   (our `billExternalReferenceNo`), `status` (1 = success), `billcode`,
 *   `amount`, plus `reason` — and an MD5 `hash` signature verified as
 *   `MD5(secret + status + order_id + refno + "ok")` before the
 *   server-to-server getBillTransactions check.
 * - Sandbox: replace the host with dev.toyyibpay.com and use sandbox
 *   credentials. TOYYIBPAY_USE_SANDBOX=1 switches host automatically.
 */

const LIVE_BASE = "https://toyyibpay.com";
const SANDBOX_BASE = "https://dev.toyyibpay.com";

/**
 * FPX transaction fee passed to the customer (Boss + Linda decision).
 * RM1.00 flat, in sen. The fee rides INSIDE the bill amount so the payer
 * sees one total (RM5.70), while `rm=` in the external reference lets the
 * callback split base vs fee for the ledger.
 */
export const TOYYIBPAY_FEE_SEN = 100;

/**
 * Single webhook the vendor ever calls. Pinned to the live domain on
 * purpose: a subdomain or preview URL in `billCallbackUrl` means ToyyibPay
 * POSTs the payment result somewhere we never read, so the bill pays but
 * no token is ever credited. The return URL stays per-request (it only
 * redirects the payer's browser); the callback must never follow `origin`.
 */
export const TOYYIBPAY_CALLBACK_URL = "https://jutaone.biz/api/topup/toyyib-callback";

export type ToyyibRequest = {
  locale: Locale;
  region: Region;
  variant: Variant;
  /** Absolute origin used for return/callback URLs. */
  origin: string;
  amountUsd?: unknown;
  ownerRef?: string;
  customerEmail?: unknown;
  /** Payer display name for billTo. */
  customerName?: unknown;
};

export type ToyyibBill = {
  mode: "toyyibpay" | "mock";
  reference: string;
  price: Price & { rmBase: number | null; fxRate: number | null };
  /** Base RM in sen, before the RM1.00 fee — shown as the breakdown line. */
  baseSen: number;
  /** Fee in sen (always 100). */
  feeSen: number;
  /** Total charged in sen (base + fee) — what the bill bills. */
  totalSen: number;
  checkoutUrl: string | null;
};

export function toyyibConfigured(): boolean {
  return Boolean(process.env.TOYYIBPAY_SECRET_KEY && process.env.TOYYIBPAY_CATEGORY_CODE);
}

export function toyyibBaseUrl(): string {
  return process.env.TOYYIBPAY_USE_SANDBOX === "1" ? SANDBOX_BASE : LIVE_BASE;
}

function sanitiseBillText(value: string, max: number): string {
  return value
    .replace(/[^A-Za-z0-9 _]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function parseToyyibEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  if (email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

export class InvalidToyyibEmailError extends Error {
  constructor() {
    super("INVALID_CUSTOMER_EMAIL: a valid payer email is required for ToyyibPay bill");
    this.name = "InvalidToyyibEmailError";
  }
}

/**
 * Creates a ToyyibPay bill for a Malaysian top-up.
 *
 * Pricing: RM base (sen) + RM1.00 fee, both inside the bill amount. The
 * `billExternalReferenceNo` carries `JO-...;rm={base};fee={fee};owner=...`
 * so the callback can credit exactly the base tokens and audit the fee.
 * Unconfigured keys -> mock session (same shape, local redirect), never a
 * throw, so the sandbox UI keeps working with no secrets.
 */
export async function createToyyibBill(req: ToyyibRequest): Promise<ToyyibBill> {
  const usd = parseTopUpAmount(req.amountUsd) ?? 1;
  const { priceForCheckout } = await import("@/lib/pricing");
  const price = await priceForCheckout("MYR", usd, req.locale);

  const baseSen = Math.round(price.amount * 100);
  const feeSen = TOYYIBPAY_FEE_SEN;
  const totalSen = baseSen + feeSen;
  // ONE identity for the whole round trip: the UI reference handed to the
  // return page (`?ref=`) IS the vendor's `billExternalReferenceNo`, so the
  // callback and `/api/topup/status` read the same row. A second, different
  // ID (the old `JO-...-TP` vs `JO-...` split) stranded the success screen
  // on "processing" forever — the status lookup never found the row.
  const reference = `JO-${Date.now().toString(36).toUpperCase()}`;
  const localePath = `/${req.locale}/topup`;

  if (!toyyibConfigured()) {
    return {
      mode: "mock",
      reference,
      price,
      baseSen,
      feeSen,
      totalSen,
      checkoutUrl: `${req.origin}${localePath}?ref=${reference}&mode=mock&amount=${usd}`,
    };
  }

  const customerEmail = parseToyyibEmail(req.customerEmail);
  if (!customerEmail) throw new InvalidToyyibEmailError();

  const customerName =
    typeof req.customerName === "string" && req.customerName.trim() !== ""
      ? req.customerName.trim().slice(0, 60)
      : "JutaOne Customer";

  const externalRef =
    `${reference}` +
    `;rm=${baseSen};fee=${feeSen};usd=${Math.round(usd * 100)}` +
    (req.ownerRef ? `;owner=${req.ownerRef}` : "") +
    `;variant=${req.variant};region=${req.region}`;

  const billName = sanitiseBillText(`JutaOne ${price.tokens.toLocaleString("en-US")} Token`, 30);
  const billDescription = sanitiseBillText(`JutaOne token topup RM${(totalSen / 100).toFixed(2)}`, 100);

  const params = new URLSearchParams({
    userSecretKey: process.env.TOYYIBPAY_SECRET_KEY as string,
    categoryCode: process.env.TOYYIBPAY_CATEGORY_CODE as string,
    billName,
    billDescription,
    billPriceSetting: "1",
    billPayorInfo: "1",
    billAmount: String(totalSen),
    billReturnUrl: `${req.origin}${localePath}?status=success&ref=${reference}`,
    billCallbackUrl: TOYYIBPAY_CALLBACK_URL,
    billExternalReferenceNo: externalRef,
    billTo: customerName,
    billEmail: customerEmail,
    billPhone: "0123456789",
    billPaymentChannel: "0",
    enableDuitNowQR: "1",
    chargeDuitNowQR: "0",
  });

  const response = await fetch(`${toyyibBaseUrl()}/index.php/api/createBill`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  const text = await response.text().catch(() => "");
  const billCode = parseCreateBillResponse(text);
  if (!billCode) {
    throw new Error(`ToyyibPay createBill failed: ${classifyBillError(text)}`);
  }

  return {
    mode: "toyyibpay",
    reference,
    price,
    baseSen,
    feeSen,
    totalSen,
    checkoutUrl: `${toyyibBaseUrl()}/${billCode}`,
  };
}

/**
 * Parses a createBill body. Success is `[{ BillCode: "abc" }]`.
 * Anything else is a failure — `{status:error,msg}` or a bracket code.
 */
export function parseCreateBillResponse(text: string): string | null {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0] as Record<string, unknown>;
      const code = first?.BillCode;
      if (typeof code === "string" && code.length > 0) return code;
    }
    return null;
  } catch {
    return null;
  }
}

function classifyBillError(text: string): string {
  const trimmed = text.trim().slice(0, 160);
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { msg?: string };
      if (parsed.msg) return String(parsed.msg).slice(0, 160);
    } catch {
      // fall through to raw text
    }
  }
  return trimmed || "empty response";
}

export type ToyyibCallback = {
  refno: string | null;
  orderId: string | null;
  hash: string | null;
  status: string | null;
  billcode: string | null;
  amount: string | null;
  reason: string | null;
};

/**
 * Verifies the vendor's MD5 callback signature.
 *
 * Official formula (https://toyyibpay.com/apireference/):
 *   MD5(userSecretKey + status + order_id + refno + "ok")
 *
 * Fails closed: a missing secret, missing hash, or missing field refuses the
 * callback. A lowercase hex compare keeps the check strict — the vendor
 * sends lowercase hex, and anything else is not its hash.
 */
export function verifyToyyibHash(callback: {
  status: string | null;
  order_id: string | null;
  refno: string | null;
  hash: string | null;
}): { ok: boolean; reason?: string } {
  const secret = process.env.TOYYIBPAY_SECRET_KEY;
  if (!secret) return { ok: false, reason: "toyyibpay_not_configured" };
  if (!callback.hash) return { ok: false, reason: "missing_hash" };
  if (callback.status == null || callback.order_id == null || callback.refno == null) {
    return { ok: false, reason: "missing_hash_fields" };
  }
  const expected = createHash("md5")
    .update(secret + callback.status + callback.order_id + callback.refno + "ok")
    .digest("hex");
  if (callback.hash.toLowerCase() !== expected) return { ok: false, reason: "invalid_hash" };
  return { ok: true };
}

/**
 * Verifies a ToyyibPay callback in two layers.
 *
 * Layer 1 (cheap, runs first): the MD5 hash the vendor POSTs must match
 * `MD5(secret + status + order_id + refno + "ok")`. A forged or corrupted
 * callback dies here without a vendor round trip.
 *
 * Layer 2 (authoritative): getBillTransactions with our secret must confirm
 * this billcode is paid for this order_id + amount. The hash proves the POST
 * came from the vendor; only the server-to-server check proves money moved.
 */
export async function verifyToyyibCallback(
  callback: ToyyibCallback,
): Promise<{ ok: boolean; reason?: string }> {
  if (!toyyibConfigured()) return { ok: false, reason: "toyyibpay_not_configured" };
  if (!callback.billcode || !callback.refno) {
    return { ok: false, reason: "missing billcode or refno" };
  }
  if (callback.status !== "1") return { ok: false, reason: "payment not successful" };

  // Layer 1: the vendor's own signature. A forged or corrupted POST dies
  // here before we spend a round trip on getBillTransactions.
  const hashCheck = verifyToyyibHash({
    status: callback.status,
    order_id: callback.orderId,
    refno: callback.refno,
    hash: callback.hash,
  });
  if (!hashCheck.ok) return hashCheck;

  const params = new URLSearchParams({
    userSecretKey: process.env.TOYYIBPAY_SECRET_KEY as string,
    billCode: callback.billcode,
  });

  let response: Response;
  try {
    response = await fetch(`${toyyibBaseUrl()}/index.php/api/getBillTransactions`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "verification unreachable" };
  }

  const rows = (await response.json().catch(() => null)) as Array<Record<string, unknown>> | null;
  if (!Array.isArray(rows)) return { ok: false, reason: "verification failed" };

  const match = rows.find(
    (row) =>
      // The vendor echoes our `billExternalReferenceNo` as `order_id` on the
      // callback but as `billExternalReferenceNo` in getBillTransactions —
      // match THAT, not `refno` (ToyyibPay's own payment reference).
      String(row.billExternalReferenceNo ?? "") === callback.orderId &&
      String(row.billpaymentStatus ?? "") === "1",
  );
  if (!match) return { ok: false, reason: "no matching paid transaction" };

  // Amount cross-check when the vendor returns it: a tampered callback that
  // inflates `amount` must not credit more tokens than the bill paid.
  // The vendor names the paid amount `billpaymentAmount` (docs sample) —
  // fall back to `billAmount` for forward-compat.
  const paidAmount = match.billpaymentAmount ?? match.billAmount;
  if (callback.amount && paidAmount != null) {
    const claimed = Number(String(callback.amount).replace(/[^0-9.]/g, ""));
    const actual = Number(String(paidAmount).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(claimed) && Number.isFinite(actual) && claimed !== actual) {
      return { ok: false, reason: "amount mismatch" };
    }
  }

  return { ok: true };
}

/**
 * Parses the external reference the bill was created with:
 * `JO-XXX;rm={baseSen};fee={feeSen};usd={usdCents};owner={hash|uuid};...`
 *
 * The owner rides back verbatim from `billExternalReferenceNo` — a signed-in
 * member's `owner_ref` (UUID or legacy hex), an anonymous buyer (visitor
 * hash). Accept any sane token, not a fixed shape: the old 64-hex-only
 * pattern silently dropped UUID owners and the real sandbox bill
 * (owner=ef4c35cba) credited to nowhere.
 */
export function parseToyyibReference(refno: string | null): {
  baseSen: number | null;
  feeSen: number | null;
  usdCents: number | null;
  ownerRef: string | null;
} {
  // The reference carries integer sen/cents by contract (`rm=470`, not
  // `rm=4.70`): the regex only accepts digits so a decimal can never slip a
  // float into a bigint column. Each value is still validated as a safe
  // integer before it is returned.
  const toRefInt = (match: RegExpMatchArray | null | undefined, min: number): number | null => {
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isSafeInteger(n) && n >= min ? n : null;
  };
  const rm = refno?.match(/rm=(\d+)(?:;|$)/);
  const fee = refno?.match(/fee=(\d+)(?:;|$)/);
  const usd = refno?.match(/usd=(\d+)(?:;|$)/);
  const owner = refno?.match(/owner=([^;]+)(?:;|$)/);
  const baseSen = toRefInt(rm, 1);
  const feeSen = toRefInt(fee, 0);
  const usdCents = toRefInt(usd, 1);
  return {
    baseSen,
    feeSen,
    usdCents,
    ownerRef: owner && owner[1].length >= 8 ? owner[1] : null,
  };
}

/**
 * Coerces any supplied amount to integer sen for bigint columns.
 *
 * The vendor posts RM ("5.70", sometimes "RM5.70"); the `topups.amount`
 * column is bigint minor units and rejects floats outright
 * (`invalid input syntax for type bigint: "5.70"`). Every path here ends in
 * `Math.round`, so the return is always an integer or null — never a float.
 */
export function toIntegerSen(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    const sen = Math.round(value * 100);
    return Number.isSafeInteger(sen) && sen > 0 ? sen : null;
  }
  if (typeof value !== "string") return null;
  const rm = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(rm) || rm <= 0) return null;
  const sen = Math.round(rm * 100);
  return Number.isSafeInteger(sen) && sen > 0 ? sen : null;
}

/**
 * Resolves the `topups.amount` value (integer sen) for a ToyyibPay callback.
 *
 * The live `topups.amount` column is bigint minor units — every other writer
 * (Chip, sandbox simulator) stores sen. The vendor posts RM ("5.70"), and
 * sending that float straight to a bigint column fails the upsert, so the
 * callback answered 200 `{recorded:false}` while crediting nothing. Prefer
 * the bill's own `rm=` + `fee=` total; fall back to converting the vendor
 * amount from RM to sen.
 */
export function resolveToyyibAmountSen(
  amount: string | null,
  ref: { baseSen: number | null; feeSen: number | null },
): number | null {
  if (ref.baseSen !== null) {
    // Both halves are already validated safe integers in
    // `parseToyyibReference`; the sum is re-checked anyway — a float must
    // never reach the bigint upsert.
    const total = ref.baseSen + (ref.feeSen ?? 0);
    return Number.isSafeInteger(total) && total > 0 ? total : null;
  }
  return toIntegerSen(amount);
}

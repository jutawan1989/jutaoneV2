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
 * - The callback carries `refno` (our external reference), `status` (1 =
 *   success), `billcode`, `amount`, plus `reason`. There is NO signature —
 *   verification is server-to-server getBillTransactions with the secret.
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
  const reference = `JO-${req.locale.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-TP`;
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
    `JO-${Date.now().toString(36).toUpperCase()}` +
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
    billCallbackUrl: `${req.origin}/api/topup/toyyib-callback`,
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
  status: string | null;
  billcode: string | null;
  amount: string | null;
  reason: string | null;
};

/**
 * Verifies a ToyyibPay callback server-to-server.
 *
 * The callback itself is unsigned, so a bare `status=1` is NEVER trusted:
 * we call getBillTransactions with our secret and only accept when the
 * vendor confirms this billcode is paid for this refno + amount.
 */
export async function verifyToyyibCallback(
  callback: ToyyibCallback,
): Promise<{ ok: boolean; reason?: string }> {
  if (!toyyibConfigured()) return { ok: false, reason: "toyyibpay_not_configured" };
  if (!callback.billcode || !callback.refno) {
    return { ok: false, reason: "missing billcode or refno" };
  }
  if (callback.status !== "1") return { ok: false, reason: "payment not successful" };

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
      String(row.billExternalReferenceNo ?? "") === callback.refno &&
      String(row.billpaymentStatus ?? "") === "1",
  );
  if (!match) return { ok: false, reason: "no matching paid transaction" };

  // Amount cross-check when the vendor returns it: a tampered callback that
  // inflates `amount` must not credit more tokens than the bill paid.
  if (callback.amount && match.billAmount != null) {
    const claimed = Number(String(callback.amount).replace(/[^0-9.]/g, ""));
    const actual = Number(String(match.billAmount).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(claimed) && Number.isFinite(actual) && claimed !== actual) {
      return { ok: false, reason: "amount mismatch" };
    }
  }

  return { ok: true };
}

/**
 * Parses the external reference the bill was created with:
 * `JO-XXX;rm={baseSen};fee={feeSen};usd={usdCents};owner={hash};...`
 */
export function parseToyyibReference(refno: string | null): {
  baseSen: number | null;
  feeSen: number | null;
  usdCents: number | null;
  ownerRef: string | null;
} {
  const rm = refno?.match(/rm=(\d+)(?:;|$)/);
  const fee = refno?.match(/fee=(\d+)(?:;|$)/);
  const usd = refno?.match(/usd=(\d+)(?:;|$)/);
  const owner = refno?.match(/owner=([a-f0-9]{64})(?:;|$)/);
  const baseSen = rm ? Number(rm[1]) : null;
  const feeSen = fee ? Number(fee[1]) : null;
  const usdCents = usd ? Number(usd[1]) : null;
  return {
    baseSen: Number.isFinite(baseSen) && (baseSen as number) > 0 ? (baseSen as number) : null,
    feeSen: Number.isFinite(feeSen) && (feeSen as number) >= 0 ? (feeSen as number) : null,
    usdCents: Number.isFinite(usdCents) && (usdCents as number) > 0 ? (usdCents as number) : null,
    ownerRef: owner ? owner[1] : null,
  };
}

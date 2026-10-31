import { createHmac, timingSafeEqual } from "node:crypto";
import { TOKENS_PER_USD } from "@/lib/pricing";

/**
 * Curlec (Razorpay) adapter — Malaysia gateway, MYR settlement, Test Mode.
 *
 * Test Mode IS the key prefix: an `rzp_test_...` key id hits the same
 * `https://api.razorpay.com/v1/orders` host but moves no real money, mirroring
 * how `sk_test_...` puts Stripe in Test Mode. No separate sandbox host exists.
 *
 * Checkout flow: POST /v1/orders (Basic auth `key_id:key_secret`, JSON) ->
 * the returned `order.id` is handed to Razorpay Checkout.js together with the
 * key id. Curlec POSTs the result JSON to `/api/topup/curlec-callback`; the
 * `order.paid` event with a `captured` payment credits tokens.
 *
 * Money rule (Boss spec): integer minor units end to end. RM5.00 travels as
 * `amount = 500` (sen) and lands in the bigint `topups.amount` as 500 — never
 * the float 5.00. Tokens credit on the BASE only: the 3% international
 * surcharge is the gateway's cut, not tokens (same posture as the retired
 * ToyyibPay RM1.00 fee).
 *
 * Token anchor: Boss fixed rate RM4.70 = $1 (same anchor as the metals
 * display). RM5.00 -> ~106 US cents -> ~1,060,000 tokens, linear.
 */

export const CURLEC_ORDERS_URL = "https://api.razorpay.com/v1/orders";
export const CURLEC_CURRENCY = "MYR";

/** Boss fixed rate: RM4.70 buys $1.00. Surcharges and tokens scale from this. */
export const CURLEC_MYR_PER_USD = 4.7;

/**
 * International-card surcharge in basis points: 300 = 3%. Applied ONLY when
 * the payer declares a foreign card (`international: true`) — the order
 * amount is fixed at creation, so the declaration is what locks the total.
 * The webhook cross-checks the real card and reports mismatches for ops.
 */
export const INTERNATIONAL_SURCHARGE_BPS = 300;

/**
 * RM4.70 minimum (=$1.00 at the Boss fixed rate, parity with the $1.00
 * Stripe floor: RM4.70 -> 100 US cents -> exactly 1,000,000 tokens).
 */
export const MIN_TOPUP_MYR = 4.7;
/** RM47,000 maximum (~$10,000, parity with the Stripe ceiling). */
export const MAX_TOPUP_MYR = 47_000;

export type CurlecOrder = {
  mode: "curlec" | "mock";
  reference: string;
  /** Razorpay order id (`order_...`), null in mock mode. */
  orderId: string | null;
  /** Key id for Checkout.js, null in mock mode. Public by Razorpay's design. */
  keyId: string | null;
  /** Top-up size in MYR major units, e.g. 5.00. */
  amountMYR: number;
  /** Base in integer sen, e.g. 500 for RM5.00. Tokens derive from this. */
  baseSen: number;
  /** Surcharge in integer sen (0 for domestic cards). */
  surchargeSen: number;
  /** Total actually charged in integer sen (base + surcharge). */
  totalSen: number;
  /** True when the payer declared a foreign card. */
  international: boolean;
  tokens: number;
  /** Headline price, always MYR with 2 decimals: `RM5.00`. */
  display: string;
  /** Local-redirect checkout in mock mode; null for live (Checkout.js). */
  checkoutUrl: string | null;
};

export type CurlecOrderOpts = {
  /** True when the payer declares a foreign card (locks +3% into the order). */
  international?: boolean;
  /** Absolute origin used for mock-mode redirects. */
  origin?: string;
  /** Two-letter locale for the return path. Defaults to "ms". */
  locale?: string;
};

export function curlecConfigured(): boolean {
  return Boolean(process.env.CURLEC_KEY_ID && process.env.CURLEC_KEY_SECRET);
}

export function parseCurlecAmountMYR(value: unknown): number | null {
  const n =
    typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  const myr = Math.round(n * 100) / 100;
  if (myr < MIN_TOPUP_MYR || myr > MAX_TOPUP_MYR) return null;
  return myr;
}

export function parseCurlecEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  if (email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

export class InvalidCurlecEmailError extends Error {
  constructor() {
    super("INVALID_CUSTOMER_EMAIL: a valid payer email is required for Curlec order");
    this.name = "InvalidCurlecEmailError";
  }
}

/** Headline formatter: `5` -> `RM5.00`. The ONLY MYR money formatter. */
export function formatMyr(myr: number): string {
  return `RM${myr.toFixed(2)}`;
}

/**
 * Quotes the charge for a base amount: domestic pays the base, a declared
 * foreign card pays base + 3% (rounded UP so the gateway cost is never
 * under-collected to zero on small tickets). Integer sen in, integer sen out.
 */
export function quoteCurlecCharge(
  baseSen: unknown,
  international: boolean,
): { baseSen: number; surchargeSen: number; totalSen: number } | null {
  if (typeof baseSen !== "number" || !Number.isSafeInteger(baseSen) || baseSen <= 0) return null;
  const surchargeSen = international ? Math.ceil((baseSen * INTERNATIONAL_SURCHARGE_BPS) / 10_000) : 0;
  if (!Number.isSafeInteger(surchargeSen) || surchargeSen < 0) return null;
  return { baseSen, surchargeSen, totalSen: baseSen + surchargeSen };
}

/** Base sen -> integer US cents at the Boss fixed rate (for tokens + commission). */
export function usdCentsForMyrSen(baseSen: number | null): number | null {
  if (baseSen === null || !Number.isSafeInteger(baseSen) || baseSen <= 0) return null;
  const cents = Math.round(baseSen / CURLEC_MYR_PER_USD);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/** Token credit for a base amount. Linear: ~106c (RM5) -> ~1,060,000 tokens. */
export function tokensForCurlecBase(baseSen: number | null): number | null {
  const usdCents = usdCentsForMyrSen(baseSen);
  if (usdCents === null) return null;
  const tokens = Math.round((usdCents / 100) * TOKENS_PER_USD);
  if (!Number.isSafeInteger(tokens) || tokens <= 0) return null;
  return tokens;
}

/**
 * Detects a foreign card from a Razorpay payment entity. Checks every place
 * Razorpay reports it — the top-level `international` flag, `card`
 * `.international`, and an explicit non-MY card country — because the exact
 * shape varies by payment method. Non-card methods (FPX, wallets) are never
 * "international cards", and an absent signal means domestic (fail closed
 * towards NO surcharge blame: the webhook only REPORTS, it never charges).
 */
export function isInternationalCard(payment: unknown): boolean {
  if (!payment || typeof payment !== "object") return false;
  const entity = payment as Record<string, unknown>;
  if (entity.international === true) return true;
  const card = entity.card;
  if (card && typeof card === "object") {
    const detail = card as Record<string, unknown>;
    if (detail.international === true) return true;
    if (typeof detail.country === "string" && detail.country.trim() !== "") {
      return detail.country.trim().toUpperCase() !== "MY";
    }
  }
  return false;
}

/**
 * Creates a Curlec/Razorpay order for a token top-up.
 *
 * Signature is positional by CTO spec: (amountMYR, ownerRef, email).
 * `opts.international` locks the 3% surcharge into the fixed order total.
 * Unconfigured keys -> mock order (same shape, local redirect), never a
 * throw, so the UI keeps working with no secrets — mirroring the Stripe
 * adapter. A bad email throws (the receipt goes there), like Stripe.
 */
export async function createCurlecOrder(
  amountMYR: unknown,
  ownerRef?: string,
  customerEmail?: unknown,
  opts?: CurlecOrderOpts,
): Promise<CurlecOrder> {
  const myr = parseCurlecAmountMYR(amountMYR) ?? MIN_TOPUP_MYR;
  const baseSen = Math.round(myr * 100);
  const international = opts?.international === true;
  const quote = quoteCurlecCharge(baseSen, international);
  if (!quote) throw new Error(`Curlec quote failed for base sen ${baseSen}`);
  const tokens = tokensForCurlecBase(quote.baseSen);
  if (tokens === null) throw new Error(`Curlec token math failed for base sen ${quote.baseSen}`);

  const reference = `JO-${Date.now().toString(36).toUpperCase()}`;
  const locale = typeof opts?.locale === "string" && /^[a-z]{2}$/.test(opts.locale) ? opts.locale : "ms";
  const origin = (opts?.origin ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://jutaone.biz").replace(/\/$/, "");
  const display = formatMyr(quote.totalSen / 100);

  if (!curlecConfigured()) {
    return {
      mode: "mock",
      reference,
      orderId: null,
      keyId: null,
      amountMYR: myr,
      baseSen: quote.baseSen,
      surchargeSen: quote.surchargeSen,
      totalSen: quote.totalSen,
      international,
      tokens,
      display,
      checkoutUrl: `${origin}/${locale}/topup?ref=${reference}&mode=mock&amountMyr=${myr}`,
    };
  }

  const email = parseCurlecEmail(customerEmail);
  if (!email) throw new InvalidCurlecEmailError();

  const owner = typeof ownerRef === "string" && ownerRef.trim() !== "" ? ownerRef.trim().slice(0, 128) : null;

  const response = await fetch(CURLEC_ORDERS_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(
        `${process.env.CURLEC_KEY_ID}:${process.env.CURLEC_KEY_SECRET}`,
        "utf8",
      ).toString("base64")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount: quote.totalSen,
      currency: CURLEC_CURRENCY,
      receipt: reference,
      notes: {
        owner_ref: owner,
        email,
        reference,
        base_sen: String(quote.baseSen),
        surcharge_sen: String(quote.surchargeSen),
        declared_international: international ? "1" : "0",
        tokens: String(tokens),
      },
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Curlec order failed: ${response.status} ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json().catch(() => null)) as { id?: unknown } | null;
  const orderId = typeof payload?.id === "string" && payload.id !== "" ? payload.id : null;
  if (!orderId) throw new Error("Curlec order response did not include an order id");

  return {
    mode: "curlec",
    reference,
    orderId,
    keyId: process.env.CURLEC_KEY_ID ?? null,
    amountMYR: myr,
    baseSen: quote.baseSen,
    surchargeSen: quote.surchargeSen,
    totalSen: quote.totalSen,
    international,
    tokens,
    display,
    checkoutUrl: null,
  };
}

/**
 * Verifies the `X-Razorpay-Signature` header (HMAC-SHA256 hex over the RAW
 * body with `CURLEC_WEBHOOK_SECRET`). Fails closed: missing secret, missing
 * header, or a non-matching digest all refuse. Local testing opts in
 * explicitly with `CURLEC_ALLOW_UNSIGNED_CALLBACKS=1` (never in production).
 */
export function verifyCurlecWebhook(rawBody: string, signature: string | null): { ok: boolean; reason?: string } {
  const secret = process.env.CURLEC_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.CURLEC_ALLOW_UNSIGNED_CALLBACKS === "1") {
      console.warn("[jutaone] accepting unsigned Curlec callback because CURLEC_ALLOW_UNSIGNED_CALLBACKS=1");
      return { ok: true };
    }
    return { ok: false, reason: "curlec_webhook_not_configured" };
  }
  if (!signature) return { ok: false, reason: "missing_signature" };

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(signature.trim().toLowerCase(), "utf8");
    const b = Buffer.from(expected.toLowerCase(), "utf8");
    if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true };
  } catch {
    // Not comparable — fall through to invalid.
  }
  return { ok: false, reason: "invalid_signature" };
}

export type CurlecWebhookPayment = {
  paymentId: string;
  orderId: string | null;
  /** Our `receipt` (the JO- reference), echoed back on the order entity. */
  receipt: string | null;
  ownerRef: string | null;
  email: string | null;
  /** Total actually charged in integer sen (base + surcharge). */
  totalSen: number | null;
  currency: string | null;
  /** Base sen from order notes — the exact checkout instruction. */
  baseSen: number | null;
  surchargeSen: number | null;
  /** Token grant from order notes (preferred) — validated safe-int. */
  tokens: number | null;
  /** ACTUAL card signal from the payment entity (vs the declared flag). */
  international: boolean;
  declaredInternational: boolean;
  method: string | null;
  status: string | null;
  cardNetwork: string | null;
};

function toSafeInt(value: unknown, min: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= min ? (n as number) : null;
}

/**
 * Parses a Curlec/Razorpay webhook event. Returns null only when the body is
 * not a Razorpay event at all; anything else parses, and the route ignores
 * by `event` type (`order.paid` is the only crediting event).
 */
export function parseCurlecEvent(rawBody: string): { type: string; payment: CurlecWebhookPayment } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;
  if (typeof root.event !== "string") return null;
  const payload = (root.payload ?? {}) as Record<string, unknown>;
  const paymentEntity = ((payload.payment ?? {}) as Record<string, unknown>).entity as Record<string, unknown>;
  const orderEntity = ((payload.order ?? {}) as Record<string, unknown>).entity as Record<string, unknown>;
  if (!paymentEntity || typeof paymentEntity !== "object") {
    return {
      type: root.event,
      payment: {
        paymentId: "",
        orderId: null,
        receipt: null,
        ownerRef: null,
        email: null,
        totalSen: null,
        currency: null,
        baseSen: null,
        surchargeSen: null,
        tokens: null,
        international: false,
        declaredInternational: false,
        method: null,
        status: null,
        cardNetwork: null,
      },
    };
  }
  const notes = (orderEntity?.notes ?? {}) as Record<string, unknown>;
  const ownerRaw = typeof notes.owner_ref === "string" ? notes.owner_ref.trim() : "";

  return {
    type: root.event,
    payment: {
      paymentId: typeof paymentEntity.id === "string" ? paymentEntity.id : "",
      orderId: typeof paymentEntity.order_id === "string" ? paymentEntity.order_id : null,
      receipt:
        orderEntity && typeof orderEntity.receipt === "string" && orderEntity.receipt !== ""
          ? (orderEntity.receipt as string)
          : null,
      ownerRef: ownerRaw !== "" ? ownerRaw : null,
      email:
        typeof notes.email === "string"
          ? notes.email
          : typeof paymentEntity.email === "string"
            ? (paymentEntity.email as string)
            : null,
      totalSen: toSafeInt(paymentEntity.amount, 1),
      currency:
        typeof paymentEntity.currency === "string" && paymentEntity.currency !== ""
          ? (paymentEntity.currency as string).toUpperCase()
          : null,
      baseSen: toSafeInt(notes.base_sen, 1),
      surchargeSen: toSafeInt(notes.surcharge_sen, 0),
      tokens: toSafeInt(notes.tokens, 1),
      international: isInternationalCard(paymentEntity),
      declaredInternational: notes.declared_international === "1",
      method: typeof paymentEntity.method === "string" ? (paymentEntity.method as string) : null,
      status: typeof paymentEntity.status === "string" ? (paymentEntity.status as string) : null,
      cardNetwork:
        paymentEntity.card && typeof paymentEntity.card === "object"
          ? ((): string | null => {
              const network = (paymentEntity.card as Record<string, unknown>).network;
              return typeof network === "string" && network !== "" ? network : null;
            })()
          : null,
    },
  };
}

/**
 * Token credit for a verified payment: the notes grant (locked at checkout)
 * wins; otherwise derive from the base sen. Surcharge sen NEVER mints tokens.
 */
export function tokensForCurlecPayment(payment: Pick<CurlecWebhookPayment, "tokens" | "baseSen">): number | null {
  if (payment.tokens !== null) return payment.tokens;
  return tokensForCurlecBase(payment.baseSen);
}

/**
 * Minimal database surface for the Curlec credit path: `topups` +
 * `token_ledger` writes plus the Kuda Merah commission RPC. Same
 * narrowed-surface pattern as the Stripe adapter so the mock-DB tests read
 * identically.
 */
type CurlecTable = {
  upsert: (
    row: Record<string, unknown>,
    opts?: Record<string, unknown>,
  ) => PromiseLike<{ error: { code?: string; message: string } | null }>;
  insert: (row: Record<string, unknown>) => PromiseLike<{ error: { code?: string; message: string } | null }>;
  select: (...args: unknown[]) => CurlecTable;
  eq: (...args: unknown[]) => CurlecTable;
  maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type CurlecCreditDb = {
  from: (table: string) => CurlecTable;
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null; data?: unknown }>;
};

/** 70% Kuda Merah split on a Curlec top-up (buyer id resolved by the caller). */
export async function distributeCurlecCommission(
  db: CurlecCreditDb,
  buyerOwnerRef: string,
  grossUsdCents: number,
): Promise<{ distributed: number } | { error: string }> {
  const codeLookup = (await db
    .from("referral_codes")
    .select("id")
    .eq("owner_ref", buyerOwnerRef)
    .maybeSingle()) as unknown as { data: { id: number } | null; error: { message: string } | null };
  const codeRow = codeLookup.data;
  const codeError = codeLookup.error;
  if (codeError || !codeRow) {
    return { distributed: 0 };
  }
  // affiliate_earnings is USD-locked: the gross here is the MYR base converted
  // to US cents at the Boss fixed rate, never MYR sen.
  const { error, data } = await db.rpc("jutaone_distribute_commission", {
    p_source: "topup",
    p_topup_id: null,
    p_rent_id: null,
    p_from_code_id: codeRow.id,
    p_gross_minor: grossUsdCents,
    p_currency: "USD",
  });
  if (error) {
    console.error("[jutaone] curlec commission distribute failed", error.message);
    return { error: "distribute_failed" };
  }
  return { distributed: typeof data === "number" ? data : 0 };
}

/**
 * Records a verified Curlec payment: one `topups` row (idempotent on
 * `provider_id`) plus one `token_ledger` credit (idempotent on `spend_ref`)
 * plus the Kuda Merah commission (USD-converted gross, idempotent per
 * purchase inside `jutaone_distribute_commission`).
 *
 * Integer guarantee: sen values are validated safe-int before use. A float
 * must never reach the bigint columns, so anything non-integer fails closed
 * with `{recorded:false}` instead of writing.
 *
 * NOTE: `topups.currency` is written as 'MYR' (actual settlement). The live
 * `topups_currency_usd` check only allows USD — apply
 * `supabase/curlec_myr.sql` BEFORE live traffic or every callback upsert
 * fails and no token is ever credited.
 */
export async function recordCurlecTopUp(
  db: CurlecCreditDb,
  payment: CurlecWebhookPayment,
): Promise<Record<string, unknown>> {
  if (!payment.paymentId) {
    return { recorded: false, reason: "missing_payment" };
  }
  const totalSen = payment.totalSen;
  const baseSen = payment.baseSen;
  if (totalSen === null || !Number.isSafeInteger(totalSen) || totalSen <= 0) {
    console.error("[jutaone] curlec topup amount not integer-safe", {
      providerId: `curlec:${payment.paymentId}`,
      amount: totalSen,
      base_sen: baseSen,
    });
    return { recorded: false, reason: "non_integer_amount" };
  }
  const safeBase = baseSen === null ? null : Math.round(baseSen);
  if (safeBase !== null && (!Number.isSafeInteger(safeBase) || safeBase <= 0)) {
    return { recorded: false, reason: "non_integer_base" };
  }
  const providerId = `curlec:${payment.paymentId}`;
  const { error } = await db.from("topups").upsert(
    {
      provider: "curlec",
      provider_id: providerId,
      reference: payment.receipt ?? payment.orderId,
      status: "paid",
      amount: totalSen,
      currency: payment.currency ?? CURLEC_CURRENCY,
      base_amount: safeBase,
      base_currency: safeBase !== null ? CURLEC_CURRENCY : null,
      fx_rate: 1 / CURLEC_MYR_PER_USD,
    },
    { onConflict: "provider_id" },
  );
  if (error) {
    return { recorded: false, reason: error.message.slice(0, 200) || "topup_record_failed" };
  }
  if (!payment.ownerRef) return { recorded: true, credited: false, reason: "missing_owner" };

  const tokens = tokensForCurlecPayment(payment);
  if (tokens === null) {
    return { recorded: true, credited: false, reason: "invalid_amount" };
  }

  const { error: ledgerError } = await db.from("token_ledger").insert({
    visitor_key: payment.ownerRef,
    delta: tokens,
    reason: "topup",
    spend_ref: providerId,
    tokens,
  });
  if (ledgerError) {
    if (ledgerError.code === "23505" || /duplicate key/i.test(ledgerError.message)) {
      return { recorded: true, credited: true, tokens, replayed: true };
    }
    console.error("[jutaone] curlec ledger credit failed", ledgerError.message, {
      providerId,
      ownerRef: payment.ownerRef,
      tokens,
    });
    return { recorded: true, credited: false, reason: "credit_failed" };
  }
  // Kuda Merah on the USD-converted base gross (affiliate_earnings is
  // USD-locked). A missing buyer code means no referrer: 0 levels written.
  const grossUsdCents = safeBase === null ? null : usdCentsForMyrSen(safeBase);
  if (grossUsdCents === null) {
    return { recorded: true, credited: true, tokens, replayed: false, commissionLevels: 0 };
  }
  const commission = await distributeCurlecCommission(db, payment.ownerRef, grossUsdCents);
  if ("error" in commission) {
    return { recorded: true, credited: true, tokens, replayed: false, commission: "failed" };
  }
  const outcome: Record<string, unknown> = {
    recorded: true,
    credited: true,
    tokens,
    replayed: false,
    commissionLevels: commission.distributed,
    international: payment.international,
  };
  if (payment.international !== payment.declaredInternational) {
    outcome.surchargeMismatch = true;
  }
  return outcome;
}

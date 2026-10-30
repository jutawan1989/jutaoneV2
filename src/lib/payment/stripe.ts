import { createHmac, timingSafeEqual } from "node:crypto";
import { TOKENS_PER_USD, formatRm, parseTopUpAmount } from "@/lib/pricing";

/**
 * Stripe adapter — global card gateway (Test Mode).
 *
 * A `sk_test_...` secret key IS Test Mode: every session created with it is a
 * test payment (card 4242 4242 4242 4242, no real charge). No extra flag or
 * host switch exists, unlike ToyyibPay's sandbox host — the key decides.
 *
 * Checkout flow: POST /v1/checkout/sessions (urlencoded) -> redirect the
 * payer to the returned `url`. Stripe POSTs the result JSON to
 * `/api/topup/stripe-callback`; the `checkout.session.completed` event with
 * `payment_status = "paid"` credits tokens.
 *
 * Money rule (Boss spec): integer minor units end to end. $1.00 travels as
 * `unit_amount = 100` (cents) and lands in the bigint `topups.amount` as
 * 100 — never the float 1.00. Token math is linear off metadata:
 * 1 USD = 1,000,000 tokens.
 */

export type StripeSession = {
  mode: "stripe" | "mock";
  reference: string;
  sessionId: string | null;
  usd: number;
  /** Integer USD cents, e.g. 100 for $1.00. */
  usdCents: number;
  /** Integer minor units stored in `topups.amount` — same as usdCents. */
  amountSen: number;
  tokens: number;
  display: string;
  checkoutUrl: string | null;
};

export type StripeCheckoutOpts = {
  /** Absolute origin used for success/cancel URLs. */
  origin?: string;
  /** Two-letter locale for the return path. Defaults to "ms". */
  locale?: string;
};

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function parseStripeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  if (email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

export class InvalidStripeEmailError extends Error {
  constructor() {
    super("INVALID_CUSTOMER_EMAIL: a valid payer email is required for Stripe checkout");
    this.name = "InvalidStripeEmailError";
  }
}

/**
 * Creates a Stripe Checkout Session for a token top-up.
 *
 * Signature is positional by Boss spec: (amountUSD, ownerRef, email).
 * `opts` only carries transport details (origin/locale) that are not part
 * of the payment instruction. Unconfigured keys -> mock session (same
 * shape, local redirect), never a throw, so the UI keeps working with no
 * secrets — mirroring the ToyyibPay/Chip adapters.
 */
export async function createStripeCheckoutSession(
  amountUSD: unknown,
  ownerRef?: string,
  customerEmail?: unknown,
  opts?: StripeCheckoutOpts,
): Promise<StripeSession> {
  const usd = parseTopUpAmount(amountUSD) ?? 1;
  const usdCents = Math.round(usd * 100);
  const tokens = Math.round(usd * TOKENS_PER_USD);
  // ONE identity for the whole round trip: the `?ref=` the return page reads
  // IS the `client_reference_id` the webhook echoes back, so the callback
  // and `/api/topup/status` read the same row.
  const reference = `JO-${Date.now().toString(36).toUpperCase()}`;
  const locale = typeof opts?.locale === "string" && /^[a-z]{2}$/.test(opts.locale) ? opts.locale : "ms";
  const origin = (opts?.origin ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://jutaone.biz").replace(/\/$/, "");
  const display = formatRm(usd);

  if (!stripeConfigured()) {
    return {
      mode: "mock",
      reference,
      sessionId: null,
      usd,
      usdCents,
      amountSen: usdCents,
      tokens,
      display,
      checkoutUrl: `${origin}/${locale}/topup?ref=${reference}&mode=mock&amount=${usd}`,
    };
  }

  // Stripe sends the receipt to this address, so it must be the real
  // customer email — no dummy fallback, same posture as Chip.
  const email = parseStripeEmail(customerEmail);
  if (!email) throw new InvalidStripeEmailError();

  const owner = typeof ownerRef === "string" && ownerRef.trim() !== "" ? ownerRef.trim().slice(0, 128) : null;

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${origin}/${locale}/topup?status=success&ref=${reference}`);
  params.set("cancel_url", `${origin}/${locale}/topup?status=cancelled&ref=${reference}`);
  params.set("client_reference_id", reference);
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][product_data][name]", `JutaOne.Biz - ${tokens.toLocaleString("en-US")} Token`);
  params.set("line_items[0][price_data][unit_amount]", String(usdCents));
  params.set("line_items[0][quantity]", "1");
  params.set("customer_email", email);
  params.set("metadata[reference]", reference);
  params.set("metadata[usd_cents]", String(usdCents));
  if (owner) params.set("metadata[owner]", owner);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Stripe checkout failed: ${response.status} ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json().catch(() => null)) as { id?: unknown; url?: unknown } | null;
  const sessionId = typeof payload?.id === "string" && payload.id !== "" ? payload.id : null;
  const url = typeof payload?.url === "string" && payload.url !== "" ? payload.url : null;
  if (!sessionId || !url) {
    throw new Error("Stripe checkout response did not include a session url");
  }

  return { mode: "stripe", reference, sessionId, usd, usdCents, amountSen: usdCents, tokens, display, checkoutUrl: url };
}

/**
 * Minimal database surface this module writes, narrowed to the two calls it
 * makes. Same shape as the ToyyibPay credit path so the mock-DB tests read
 * identically.
 */
export type StripeCreditDb = {
  from(table: string): {
    upsert: (
      row: Record<string, unknown>,
      opts?: Record<string, unknown>,
    ) => PromiseLike<{ error: { code?: string; message: string } | null }>;
    insert: (
      row: Record<string, unknown>,
    ) => PromiseLike<{ error: { code?: string; message: string } | null }>;
  };
};

export type StripeWebhookSession = {
  sessionId: string;
  reference: string | null;
  ownerRef: string | null;
  /** From `metadata.usd_cents` — the exact checkout instruction. */
  usdCents: number | null;
  /** Stripe's own `amount_total` (integer cents) — fallback and cross-check. */
  amountTotalCents: number | null;
  currency: string | null;
  email: string | null;
  paymentStatus: string | null;
};

function toSafeInt(value: unknown, min: number): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  return Number.isSafeInteger(n) && n >= min ? (n as number) : null;
}

/**
 * Verifies the `Stripe-Signature` header (HMAC-SHA256).
 *
 * Signed payload is `${t}.${rawBody}` with `STRIPE_WEBHOOK_SECRET`; the
 * header carries `t=` (unix seconds) plus one or more `v1=` signatures (key
 * rotation). Fails closed: missing secret, missing/malformed header, stale
 * timestamp (> 5 min skew either way), or no matching v1 all refuse.
 * Local testing opts in explicitly with `STRIPE_ALLOW_UNSIGNED_CALLBACKS=1`.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  toleranceSec = 300,
): { ok: boolean; reason?: string } {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.STRIPE_ALLOW_UNSIGNED_CALLBACKS === "1") {
      console.warn("[jutaone] accepting unsigned Stripe callback because STRIPE_ALLOW_UNSIGNED_CALLBACKS=1");
      return { ok: true };
    }
    return { ok: false, reason: "stripe_webhook_not_configured" };
  }
  if (!header) return { ok: false, reason: "missing_signature" };

  let t: string | null = null;
  const v1s: string[] = [];
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "t" && t === null) t = value;
    else if (key === "v1" && value !== "") v1s.push(value);
  }
  if (!t || v1s.length === 0 || !/^\d+$/.test(t)) return { ok: false, reason: "malformed_signature" };

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(t)) > toleranceSec) return { ok: false, reason: "stale_signature" };

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  for (const candidate of v1s) {
    try {
      const a = Buffer.from(candidate.toLowerCase(), "utf8");
      const b = Buffer.from(expected.toLowerCase(), "utf8");
      if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true };
    } catch {
      // Not a comparable value — try the next v1.
    }
  }
  return { ok: false, reason: "invalid_signature" };
}

/**
 * Parses a Stripe webhook event. Returns null only when the body is not a
 * Stripe event at all; anything else (including non-checkout event types)
 * parses, and the route ignores by `type`.
 */
export function parseStripeEvent(rawBody: string): { type: string; session: StripeWebhookSession } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;
  if (typeof root.type !== "string") return null;
  const data = root.data as Record<string, unknown> | undefined;
  const obj = (data?.object ?? {}) as Record<string, unknown>;
  const metadata = (obj.metadata ?? {}) as Record<string, unknown>;

  const sessionId = typeof obj.id === "string" ? obj.id : "";
  const clientRef = typeof obj.client_reference_id === "string" && obj.client_reference_id !== "" ? obj.client_reference_id : null;
  const metaRef = typeof metadata.reference === "string" && metadata.reference !== "" ? metadata.reference : null;
  const ownerRaw = typeof metadata.owner === "string" ? metadata.owner.trim() : "";

  return {
    type: root.type,
    session: {
      sessionId,
      reference: clientRef ?? metaRef,
      // Stripe metadata is stored verbatim (no 50-char truncation like the
      // old ToyyibPay ref), so any non-empty owner rides back intact.
      ownerRef: ownerRaw !== "" ? ownerRaw : null,
      usdCents: toSafeInt(metadata.usd_cents, 1),
      amountTotalCents: toSafeInt(obj.amount_total, 1),
      currency: typeof obj.currency === "string" && obj.currency !== "" ? obj.currency.toUpperCase() : null,
      email: typeof obj.customer_email === "string" ? obj.customer_email : null,
      paymentStatus: typeof obj.payment_status === "string" ? obj.payment_status : null,
    },
  };
}

/** Token credit for a verified Stripe session. Linear: 1 USD = 1M tokens. */
export function tokensForStripeSession(session: Pick<StripeWebhookSession, "usdCents" | "amountTotalCents">): number | null {
  const usdCents = session.usdCents ?? session.amountTotalCents;
  if (usdCents === null) return null;
  const tokens = Math.round((usdCents / 100) * TOKENS_PER_USD);
  if (!Number.isSafeInteger(tokens) || tokens <= 0) return null;
  return tokens;
}

/**
 * Records a verified Stripe checkout: one `topups` row (idempotent on
 * `provider_id`) plus one `token_ledger` credit (idempotent on `spend_ref`).
 *
 * Integer guarantee: `amount_total` arrives from Stripe as integer cents and
 * `metadata.usd_cents` is validated to safe-int before use. A float must
 * never reach the bigint columns, so anything non-integer fails closed with
 * `{recorded:false}` instead of writing.
 */
export async function recordStripeTopUp(
  db: StripeCreditDb,
  session: StripeWebhookSession,
): Promise<Record<string, unknown>> {
  if (!session.sessionId) {
    return { recorded: false, reason: "missing_session" };
  }
  const amountSen = session.amountTotalCents ?? session.usdCents;
  if (amountSen === null || !Number.isSafeInteger(amountSen) || amountSen <= 0) {
    console.error("[jutaone] stripe topup amount not integer-safe", {
      providerId: `stripe:${session.sessionId}`,
      amount_total: session.amountTotalCents,
      usd_cents: session.usdCents,
    });
    return { recorded: false, reason: "non_integer_amount" };
  }
  const providerId = `stripe:${session.sessionId}`;
  const { error } = await db.from("topups").upsert(
    {
      provider: "stripe",
      provider_id: providerId,
      reference: session.reference,
      status: "paid",
      amount: amountSen,
      currency: session.currency ?? "USD",
      base_amount: null,
      base_currency: null,
      fx_rate: null,
    },
    { onConflict: "provider_id" },
  );
  if (error) {
    console.error("[jutaone] stripe topup record failed", error.message, { providerId });
    return { recorded: false };
  }
  if (!session.ownerRef) return { recorded: true, credited: false, reason: "missing_owner" };

  const tokens = tokensForStripeSession(session);
  if (tokens === null) {
    return { recorded: true, credited: false, reason: "invalid_amount" };
  }

  const { error: ledgerError } = await db.from("token_ledger").insert({
    visitor_key: session.ownerRef,
    delta: tokens,
    reason: "topup",
    spend_ref: providerId,
    tokens,
  });
  if (ledgerError) {
    if (ledgerError.code === "23505" || /duplicate key/i.test(ledgerError.message)) {
      return { recorded: true, credited: true, tokens, replayed: true };
    }
    console.error("[jutaone] stripe ledger credit failed", ledgerError.message, {
      providerId,
      ownerRef: session.ownerRef,
      tokens,
    });
    return { recorded: true, credited: false, reason: "credit_failed" };
  }
  return { recorded: true, credited: true, tokens, replayed: false };
}

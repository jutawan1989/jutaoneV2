import { randomUUID, verify as verifySignature } from "node:crypto";
import { formatTokenCount, parseTopUpAmount, type Price } from "@/lib/pricing";
import type { Locale, Region } from "@/lib/i18n/config";
import type { Variant } from "@/lib/analytics/variant";

const DEFAULT_BASE_URL = "https://gate.chip-in.asia/api/v1";

export type TopUpRequest = {
  locale: Locale;
  region: Region;
  variant: Variant;
  /** Absolute origin used for redirect URLs, e.g. https://jutaone.biz */
  origin: string;
  /** Requested top-up size in USD. Defaults to $1 when absent or invalid. */
  amountUsd?: unknown;
  /** Pseudonymous visitor hash, embedded in Chip notes so the webhook can credit tokens. */
  ownerRef?: string;
  /** Payer email for Chip's client record — Chip sends the OTP/receipt here. */
  customerEmail?: unknown;
};

export type TopUpSession = {
  mode: "chip" | "mock";
  reference: string;
  price: Price;
  checkoutUrl: string | null;
};

/**
 * Languages Chip's hosted checkout accepts.
 *
 * Measured against the gateway: `en` returns 201 while `ms`, `id`, `bm`, `in`,
 * `zh`, `th`, `vi` and `en-MY` all return 400 "not a valid choice". Passing the
 * site locale through therefore failed every Malay and Indonesian purchase with
 * a 502 from our own API. The checkout page is English-only; the site around it
 * stays in the visitor's language and the product name is already localized.
 */
const CHIP_CHECKOUT_LANGUAGES = new Set<string>(["en"]);

export function chipCheckoutLanguage(locale: Locale): string {
  return CHIP_CHECKOUT_LANGUAGES.has(locale) ? locale : "en";
}

export function chipConfigured(): boolean {
  return Boolean(process.env.CHIP_API_KEY && process.env.CHIP_BRAND_ID);
}

export function generateReference(locale: Locale): string {
  return `JO-${locale.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
}

/**
 * Accepts a payer email from the checkout form. Returns the trimmed address
 * when it looks deliverable, otherwise null so the caller can fall back.
 * Deliberately strict: an invalid address must never reach Chip as the OTP
 * destination — Chip would send the one-time passcode into the void and the
 * customer could never complete payment.
 */
export function parseCustomerEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  if (email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

/**
 * Thrown when the payer email is missing or invalid. The caller (API route)
 * maps this to a 400 so the form can highlight the email field instead of
 * sending a dummy address to Chip — Chip sends the payment OTP to this
 * address, so a placeholder means the customer can never complete payment.
 */
export class InvalidCustomerEmailError extends Error {
  constructor() {
    super("INVALID_CUSTOMER_EMAIL: a valid payer email is required for Chip purchase");
    this.name = "InvalidCustomerEmailError";
  }
}

/**
 * Payment methods to offer at the Chip checkout.
 *
 * Read from `CHIP_PAYMENT_METHODS` (comma-separated, e.g.
 * `fpx,visa,mastercard,duitnow_qr`). When unset, the field is OMITTED from the
 * purchase request and Chip shows every method the brand has enabled —
 * including foreign cards and DuitNow QR (Online), which is how Indonesian
 * wallets (BCA, DANA, ShopeePay) pay cross-border via the DuitNow–QRIS
 * linkage with settlement in MYR. Only set the env var to RESTRICT methods,
 * never to enable them.
 */
export function paymentMethodWhitelist(): string[] | undefined {
  const raw = process.env.CHIP_PAYMENT_METHODS;
  if (!raw) return undefined;
  const methods = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return methods.length > 0 ? methods : undefined;
}
/**
 * Creates a Chip.Asia purchase (sandbox or production depending on the key).
 *
 * The payer's email arrives from the checkout form and is stored on Chip's
 * client record — Chip sends the payment OTP/receipt to it, so it must be the
 * real customer address. There is no dummy fallback: an invalid address
 * throws InvalidCustomerEmailError and the API answers 400.
 */
export async function createTopUpSession(req: TopUpRequest): Promise<TopUpSession> {
  const usd = parseTopUpAmount(req.amountUsd) ?? 1;
  const { getPrice, priceForCheckout } = await import("@/lib/pricing");
  const base = getPrice(req.region, req.locale);
  const price = await priceForCheckout(base.currency, usd, req.locale);
  const reference = generateReference(req.locale);
  const localePath = `/${req.locale}/topup`;

  if (!chipConfigured()) {
    return {
      mode: "mock",
      reference,
      price,
      checkoutUrl: `${req.origin}${localePath}?ref=${reference}&mode=mock&amount=${usd}`,
    };
  }

  const baseUrl = (process.env.CHIP_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const customerEmail = parseCustomerEmail(req.customerEmail);
  if (!customerEmail) throw new InvalidCustomerEmailError();
  const whitelist = paymentMethodWhitelist();
  // RM base + FX rate ride in the notes so the callback can record the RM
  // value in Supabase even though Chip only settles the IDR amount.
  const fxNote =
    price.currency === "IDR" && "rmBase" in price && price.rmBase !== null
      ? `;rm=${Math.round(price.rmBase * 100)};fx=${price.fxRate ?? ""}`
      : "";
  const body = {
    brand_id: process.env.CHIP_BRAND_ID,
    reference,
    send_receipt: false,
    // Omitted when CHIP_PAYMENT_METHODS is unset: Chip then offers every
    // method the brand enables (FPX, local + foreign cards, DuitNow QR, wallets).
    ...(whitelist ? { payment_method_whitelist: whitelist } : {}),
    client: {
      email: customerEmail,
      full_name: "JutaOne Customer",
    },
    purchase: {
      currency: price.currency,
      language: chipCheckoutLanguage(req.locale),
      products: [
        {
          name: `JutaOne.Biz - ${formatTokenCount(price.tokens, req.locale)}`,
          price: price.amountMinor,
          quantity: 1,
        },
      ],
      notes: req.ownerRef ? `variant=${req.variant};region=${req.region};owner=${req.ownerRef};usd=${Math.round(usd * 100)}${fxNote}` : `variant=${req.variant};region=${req.region}${fxNote}`,
    },
    success_redirect: `${req.origin}${localePath}?status=success&ref=${reference}`,
    failure_redirect: `${req.origin}${localePath}?status=failed&ref=${reference}`,
    cancel_redirect: `${req.origin}${localePath}?status=cancelled&ref=${reference}`,
  };

  const response = await fetch(`${baseUrl}/purchases/`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.CHIP_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Chip.Asia responded ${response.status}: ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as { id?: string; checkout_url?: string; invoice_url?: string };
  // `invoice_url` opens the invoice view (no Pay button) — only `checkout_url`
  // opens the payment page. Fail closed if Chip ever returns an invoice link here.
  if (!payload.checkout_url || payload.checkout_url.includes("/invoice")) {
    throw new Error("Chip.Asia response did not include a usable checkout_url");
  }

  return { mode: "chip", reference, price, checkoutUrl: payload.checkout_url };
}

/**
 * Chip signs callbacks with its private key; the matching public key is set in
 * `CHIP_PUBLIC_KEY`. Without a key, callbacks are rejected: fail closed, so a
 * missing secret can never turn into an open webhook. Local testing opts in
 * explicitly with `CHIP_ALLOW_UNSIGNED_CALLBACKS=1`.
 */
export function verifyCallbackSignature(
  rawBody: string,
  signatureHeader: string | null,
): { ok: boolean; reason?: string } {
  const publicKey = process.env.CHIP_PUBLIC_KEY?.replace(/\\n/g, "\n");
  if (!publicKey) {
    if (process.env.CHIP_ALLOW_UNSIGNED_CALLBACKS === "1") {
      console.warn("[jutaone] accepting unsigned Chip callback because CHIP_ALLOW_UNSIGNED_CALLBACKS=1");
      return { ok: true };
    }
    return { ok: false, reason: "CHIP_PUBLIC_KEY is not configured" };
  }
  if (!signatureHeader) return { ok: false, reason: "missing signature header" };

  try {
    const ok = verifySignature(
      "RSA-SHA256",
      Buffer.from(rawBody),
      publicKey,
      Buffer.from(signatureHeader, "base64"),
    );
    return ok ? { ok: true } : { ok: false, reason: "invalid signature" };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
}

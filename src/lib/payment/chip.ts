import { randomUUID, verify as verifySignature } from "node:crypto";
import { getPrice, type FxRates, type Price } from "@/lib/pricing";
import type { Locale, Region } from "@/lib/i18n/config";
import type { Variant } from "@/lib/analytics/variant";

const DEFAULT_BASE_URL = "https://gate.chip-in.asia/api/v1";

export type TopUpRequest = {
  locale: Locale;
  region: Region;
  variant: Variant;
  /** Absolute origin used for redirect URLs, e.g. https://jutaone.biz */
  origin: string;
  /** Live FX rates, so the local amount matches what the site displayed. */
  rates?: FxRates;
};

export type TopUpSession = {
  mode: "chip" | "mock";
  reference: string;
  price: Price;
  checkoutUrl: string | null;
};

export function chipConfigured(): boolean {
  return Boolean(process.env.CHIP_API_KEY && process.env.CHIP_BRAND_ID);
}

export function generateReference(locale: Locale): string {
  return `JO-${locale.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
}

/**
 * Languages Chip's hosted checkout actually accepts.
 *
 * Measured against the sandbox: `en` returns 201, while `ms` and `id` — the two
 * markets this product is built for — return 400 `"ms" is not a valid choice.`
 * Passing the locale straight through therefore failed every Malay and
 * Indonesian purchase. `bm`, `in`, `zh`, `th`, `vi` and `en-MY` are rejected too.
 *
 * The checkout page falls back to English; the site around it stays in the
 * visitor's language, and the product name is already localized.
 */
const CHIP_CHECKOUT_LANGUAGES = new Set<string>(["en"]);
const CHIP_FALLBACK_LANGUAGE = "en";

export function chipCheckoutLanguage(locale: Locale): string {
  return CHIP_CHECKOUT_LANGUAGES.has(locale) ? locale : CHIP_FALLBACK_LANGUAGE;
}

/**
 * Creates a Chip.Asia purchase (sandbox or production depending on the key).
 *
 * The local flow collects no PII before this point; the payer's email is
 * entered on Chip's hosted checkout page. `CHIP_TEST_EMAIL` only exists so the
 * sandbox API can be exercised without a form.
 */
export async function createTopUpSession(req: TopUpRequest): Promise<TopUpSession> {
  const price = getPrice(req.region, req.rates);
  const reference = generateReference(req.locale);
  const localePath = `/${req.locale}/topup`;

  if (!chipConfigured()) {
    return {
      mode: "mock",
      reference,
      price,
      checkoutUrl: `${req.origin}${localePath}?ref=${reference}&mode=mock`,
    };
  }

  const baseUrl = (process.env.CHIP_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const body = {
    brand_id: process.env.CHIP_BRAND_ID,
    reference,
    send_receipt: false,
    client: {
      email: process.env.CHIP_TEST_EMAIL || "sandbox@jutaone.biz",
      full_name: "JutaOne Sandbox",
    },
    purchase: {
      currency: price.currency,
      language: chipCheckoutLanguage(req.locale),
      products: [
        {
          name: `JutaOne.Biz — ${price.tokensLabel[req.locale]}`,
          price: price.amountMinor,
          quantity: 1,
        },
      ],
      // The base price and the rate travel with the purchase, so the ledger and
      // a support ticket can both explain the local amount without knowing what
      // the FX rate was at the time.
      notes:
        `variant=${req.variant};region=${req.region};` +
        `base=${price.baseUsdCents}usc;fx=${price.fxRate};fxsrc=${price.fxSource}`,
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

  const payload = (await response.json()) as { id?: string; checkout_url?: string };
  if (!payload.checkout_url) {
    throw new Error("Chip.Asia response did not include a checkout_url");
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

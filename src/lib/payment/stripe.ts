/**
 * Stripe adapter — CLOSED by CTO directive (Curlec is the single gateway).
 *
 * The full Stripe implementation (checkout sessions, webhook verification,
 * token credit, commission split) has been removed. This module keeps the
 * historical export names as closed stubs so any leftover import fails
 * loudly at call time instead of opening a Stripe session — and so the
 * build does not break on a stale reference.
 *
 * DO NOT re-implement Stripe here. All transactions route via
 * `@/lib/payment/curlec` (token top-up, MYR). Store Rent checkout is
 * handled separately (Chip legacy callback / Curlec Rent when specified).
 */

export const STRIPE_CLOSED = true as const;

const CLOSED_MESSAGE = "Stripe CLOSED: use Curlec (gateway=curlec) for all transactions";

export type StripeSession = {
  mode: "stripe" | "mock";
  reference: string;
  sessionId: string | null;
  usd: number;
  usdCents: number;
  amountSen: number;
  tokens: number;
  display: string;
  checkoutUrl: string | null;
};

export type StripeCheckoutOpts = {
  origin?: string;
  locale?: string;
};

/** Always false: Stripe is closed, no key is ever read. */
export function stripeConfigured(): boolean {
  return false;
}

/** Always null: no Stripe email is ever accepted. */
export function parseStripeEmail(_value: unknown): string | null {
  return null;
}

export class InvalidStripeEmailError extends Error {
  constructor() {
    super("INVALID_CUSTOMER_EMAIL: " + CLOSED_MESSAGE);
    this.name = "InvalidStripeEmailError";
  }
}

/** Never opens a session — Stripe is closed. */
export async function createStripeCheckoutSession(
  _amountUSD: unknown,
  _ownerRef?: string,
  _customerEmail?: unknown,
  _opts?: StripeCheckoutOpts,
): Promise<StripeSession> {
  throw new Error(CLOSED_MESSAGE);
}

type StripeTable = {
  upsert: (
    row: Record<string, unknown>,
    opts?: Record<string, unknown>,
  ) => PromiseLike<{ error: { code?: string; message: string } | null }>;
  insert: (
    row: Record<string, unknown>,
  ) => PromiseLike<{ error: { code?: string; message: string } | null }>;
  select: (...args: unknown[]) => StripeTable;
  eq: (...args: unknown[]) => StripeTable;
  maybeSingle: () => PromiseLike<{ data: unknown; error: string | null }>;
};

export type StripeCreditDb = {
  from: (table: string) => StripeTable;
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ error: { message: string } | null; data?: unknown }>;
};

export type StripeWebhookSession = {
  sessionId: string;
  reference: string | null;
  ownerRef: string | null;
  usdCents: number | null;
  amountTotalCents: number | null;
  currency: string | null;
  email: string | null;
  paymentStatus: string | null;
};

/** Never verifies — Stripe callbacks are refused at the route (410). */
export function verifyStripeSignature(
  _rawBody: string,
  _header: string | null,
  _toleranceSec = 300,
): { ok: boolean; reason?: string } {
  return { ok: false, reason: "stripe_closed" };
}

/** Always null — no Stripe event is ever parsed. */
export function parseStripeEvent(_rawBody: string): { type: string; session: StripeWebhookSession } | null {
  return null;
}

/** Always null — no Stripe session ever mints tokens. */
export function tokensForStripeSession(
  _session: Pick<StripeWebhookSession, "usdCents" | "amountTotalCents">,
): number | null {
  return null;
}

/** Never distributes — Stripe is closed. */
export async function distributeStripeCommission(
  _db: StripeCreditDb,
  _buyerOwnerRef: string,
  _grossCents: number,
  _topupId: number | null,
): Promise<{ distributed: number } | { error: string }> {
  return { error: "stripe_closed" };
}

/** Never records — Stripe callbacks are refused at the route (410). */
export async function recordStripeTopUp(
  _db: StripeCreditDb,
  _session: StripeWebhookSession,
): Promise<Record<string, unknown>> {
  return { recorded: false, reason: "stripe_closed" };
}

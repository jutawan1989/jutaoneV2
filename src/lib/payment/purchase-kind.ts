/**
 * Tells a Store Rent payment apart from a token top-up.
 *
 * Both products arrive on `/api/topup/callback`, signed by the same key, and
 * Chip's payload has no product field we control. The marker we put in the
 * purchase notes at checkout is therefore the only discriminator — so it has to
 * be parsed strictly. A loose check ("does the note mention rent?") would let a
 * token purchase open a store for free.
 *
 * Kept out of the route module because Next.js route files may only export
 * HTTP handlers and config.
 */
export type PurchaseKind = "rent" | "tokens";

export type ClassifiedPurchase = {
  kind: PurchaseKind;
  /** Pseudonymous merchant hash, present only on rent payments. */
  ownerRef: string | null;
  usdCents: number | null;
  monthly: boolean;
  /** RM base in sen (from `rm=` note) — the base value for IDR checkouts. */
  rmCents: number | null;
  /** RM->IDR rate used at checkout (from `fx=` note). */
  fxRate: number | null;
};

export function classifyPurchase(notes: string | undefined): ClassifiedPurchase {
  // The marker must be its own `key=value` pair, so "kind=rental" or a note that
  // merely mentions rent is not mistaken for a subscription.
  const kind: PurchaseKind = /(^|;)kind=rent(;|$)/.test(notes ?? "") ? "rent" : "tokens";

  // The owner is a 64-char hex hash. Anything shorter is a malformed or
  // truncated value and must not be trusted as an identity.
  const owner = notes?.match(/owner=([a-f0-9]{64})(?:;|$)/);
  const usd = notes?.match(/usd=(\d+)(?:;|$)/);
  const usdCents = usd ? Number(usd[1]) : null;
  const rm = notes?.match(/rm=(\d+)(?:;|$)/);
  const rmCents = rm ? Number(rm[1]) : null;
  const fx = notes?.match(/fx=([\d.]+)(?:;|$)/);
  const fxRate = fx ? Number(fx[1]) : null;

  return {
    kind,
    ownerRef: owner ? owner[1] : null,
    usdCents: Number.isFinite(usdCents) ? usdCents : null,
    monthly: /(^|;)monthly(;|$)/.test(notes ?? ""),
    rmCents: Number.isFinite(rmCents) && (rmCents as number) > 0 ? (rmCents as number) : null,
    fxRate: Number.isFinite(fxRate) && (fxRate as number) > 0 ? (fxRate as number) : null,
  };
}

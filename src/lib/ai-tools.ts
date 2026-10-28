/**
 * Shared contract for the two member-paid AI tools Ali is wiring into the
 * dashboard tools tab (Chat AI + Cari Pembekal Live).
 *
 * One module, one source of truth: URL, method, request shape, cost and the
 * 402 copy all live here. The components import these constants instead of
 * hardcoding paths, so a route change cannot desync the UI from the API.
 */

/** POST { message, locale?, rid? } — 5,000 tokens per answered reply. */
export const CHAT_API = {
  url: "/api/chat",
  method: "POST" as const,
  costTokens: 5_000,
  /** Body keys the route reads. `rid` is optional idempotency. */
  bodyKeys: ["message", "locale", "rid"] as const,
} as const;

/** GET ?q=&country=&rid= — 10,000 tokens per successful search. */
export const BIZ_SEARCH_API = {
  url: "/api/biz-match/search",
  method: "GET" as const,
  costTokens: 10_000,
  /** Query keys the route reads. */
  queryKeys: ["q", "country", "rid"] as const,
} as const;

export type InsufficientResponse = {
  code: "insufficient_tokens";
  required: number;
  balance: number;
};

export type ToolBilling = {
  chargedTokens: number;
  balanceAfter: number;
  replayed?: boolean;
};

/** Parse the balance the API reports, or null when the shape is unknown. */
export function readBalanceAfter(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const billing = (payload as { billing?: unknown }).billing;
  if (billing && typeof billing === "object") {
    const after = (billing as { balanceAfter?: unknown }).balanceAfter;
    if (typeof after === "number" && Number.isFinite(after)) return after;
  }
  const direct = (payload as { balanceAfter?: unknown }).balanceAfter;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  return null;
}

/** True when the response is the standard paywall both tools share. */
export function isInsufficient(payload: unknown): payload is InsufficientResponse {
  if (!payload || typeof payload !== "object") return false;
  return (payload as { code?: unknown }).code === "insufficient_tokens";
}

/** Malay paywall line shown under both tools when tokens run out. */
export function paywallMessage(required: number, balance: number): string {
  return `Baki tidak cukup — perlu ${required.toLocaleString("en-US")} token, baki ${balance.toLocaleString("en-US")}. Top-up untuk sambung.`;
}

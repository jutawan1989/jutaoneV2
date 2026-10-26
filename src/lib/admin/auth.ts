import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Admin session handling for the internal playground.
 *
 * Passwords are compared in constant time, and the session is a signed cookie
 * rather than the password itself, so the secret never travels on every request
 * and cannot be read from browser storage.
 *
 * The signing key is derived from the configured password, so rotating the
 * password invalidates every existing session without a second env var.
 */

export const ADMIN_COOKIE = "jo_admin";
/** Long enough for a testing session, short enough to expire on its own. */
export const ADMIN_SESSION_SECONDS = 60 * 60 * 8;

export function adminConfigured(): boolean {
  const password = process.env.ADMIN_TEST_PASSWORD ?? "";
  // A short password on a route that spends real API credit is worse than no
  // route at all, so refuse to enable it rather than accept "boss1".
  return password.length >= 12;
}

export function adminMisconfiguredReason(): string | null {
  const password = process.env.ADMIN_TEST_PASSWORD;
  if (password === undefined || password === "") return "ADMIN_TEST_PASSWORD is not set";
  if (password.length < 12) return "ADMIN_TEST_PASSWORD must be at least 12 characters";
  return null;
}

/** Constant-time comparison that does not leak length through timing. */
export function passwordMatches(candidate: string): boolean {
  const expected = process.env.ADMIN_TEST_PASSWORD ?? "";
  if (!expected) return false;

  const a = createHmac("sha256", "jutaone-admin-compare").update(candidate).digest();
  const b = createHmac("sha256", "jutaone-admin-compare").update(expected).digest();
  return timingSafeEqual(a, b);
}

function sign(payload: string): string {
  const key = process.env.ADMIN_TEST_PASSWORD ?? "";
  return createHmac("sha256", `jutaone-admin-session:${key}`).update(payload).digest("hex");
}

/** `expiry.signature` — stateless, so no session table is needed. */
export function issueSession(now = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + ADMIN_SESSION_SECONDS;
  const payload = String(expiresAt);
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload);
  // Both are hex of equal length, so a length check is safe before the compare.
  if (signature.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt * 1000 > now;
}

/**
 * Reads a bearer token or `x-admin-token` header, for scripting the playground
 * with curl. Same secret as the page, so there is one thing to rotate.
 */
export function authorisedByHeader(headers: Headers): boolean {
  const bearer = headers.get("authorization");
  const token = bearer?.toLowerCase().startsWith("bearer ")
    ? bearer.slice(7).trim()
    : (headers.get("x-admin-token") ?? "").trim();
  if (!token) return false;
  return passwordMatches(token);
}

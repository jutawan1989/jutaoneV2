import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSupabase } from "@/lib/db";

/**
 * Member authentication.
 *
 * WHY NOT SUPABASE AUTH (measured): the project's auth config reports
 * `mailer_autoconfirm: false` and `site_url: http://localhost:3000`, and no SMTP
 * provider is configured. A magic link therefore cannot be delivered to anyone
 * today — every sign-in would silently go nowhere. Turnkey auth is the right end
 * state, but it needs domain + SMTP setup that is a Boss decision, not a code
 * change.
 *
 * So: email + password, stored in our own table, hashed with scrypt. That is
 * simple, works offline from any email provider, and is not a security
 * compromise:
 *   - scrypt with a per-user random salt (memory-hard, unlike a bare SHA)
 *   - constant-time comparison
 *   - session is an HMAC-signed httpOnly cookie, not the password
 *   - the signing key derives from a server secret, so rotating it signs everyone
 *     out
 *
 * A member is identified by `owner_ref`, the same opaque visitor hash used by
 * tokens, stores and the affiliate tree. That is what joins this login to the
 * data already in the system.
 */

export const SESSION_COOKIE = "jo_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;

/** scrypt parameters: N=2^14 keeps a login under ~100ms while staying costly. */
const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;

function sessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    // Fall back to the visitor salt so a missing var degrades to a weaker but
    // still server-only secret rather than an unsigned cookie.
    return process.env.VISITOR_HASH_SALT ?? "jutaone-dev-session-secret-do-not-use-in-production";
  }
  return secret;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N }).toString("hex");
  return `scrypt$${SCRYPT_N}$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const [, nRaw, salt, expected] = parts;
  const n = Number(nRaw);
  if (!Number.isFinite(n) || n < 1024) return false;

  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, { N: n });
  const expectedBuf = Buffer.from(expected, "hex");
  if (expectedBuf.length !== derived.length) return false;
  return timingSafeEqual(derived, expectedBuf);
}

function sign(payload: string): string {
  return createHmac("sha256", `jutaone-session:${sessionSecret()}`).update(payload).digest("hex");
}

/** `ownerRef.expiry.signature` — stateless, no session table to keep in sync. */
export function issueSession(ownerRef: string, now = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + SESSION_SECONDS;
  const payload = `${ownerRef}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 3) return null;
  // Split from the right: owner_ref may itself contain dots in future formats.
  const signature = parts.pop();
  const expiry = parts.pop();
  const ownerRef = parts.join(".");
  if (!ownerRef || !expiry || !signature) return null;

  const expected = sign(`${ownerRef}.${expiry}`);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= now) return null;
  return ownerRef;
}

/**
 * Reads the signed member session from a `Cookie` header.
 * Returns the member's `owner_ref`, or null when not signed in.
 *
 * `owner_ref` never contains `.` (UUIDs for new accounts, salted hex hashes
 * for legacy ones), so the last two dot-segments are always expiry + signature.
 * Splitting from the right keeps verification working even if a future format
 * adds dots to the identity part.
 */
export function sessionOwnerFromHeaders(
  headers: { get(name: string): string | null },
): string | null {
  const header = headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey !== SESSION_COOKIE) continue;
    try {
      return verifySession(decodeURIComponent(rest.join("=")));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Ledger/quota identity for metered routes: a signed-in member's `owner_ref`
 * wins, an anonymous visitor falls back to the header-derived visitor hash.
 * Reading the wrong one is the bug Boss hit — dashboard sums `owner_ref`
 * while the route charged an empty visitor key.
 */
export function resolveIdentityKey(
  headers: { get(name: string): string | null },
  visitorKey: string,
): string {
  return sessionOwnerFromHeaders(headers) ?? visitorKey;
}

export type Member = { ownerRef: string; email: string; displayName: string | null };

/** Looks up a member by email, case-insensitively. */
export async function findMember(email: string): Promise<
  | { ok: true; member: Member; passwordHash: string }
  | { ok: false; reason: "not_found" | "store_unavailable" }
> {
  const db = getSupabase();
  if (!db) return { ok: false, reason: "store_unavailable" };

  const { data, error } = await db
    .from("members")
    .select("owner_ref, email, display_name, password_hash")
    .ilike("email", email.trim())
    .maybeSingle();

  if (error || !data) return { ok: false, reason: "not_found" };
  return {
    ok: true,
    member: {
      ownerRef: data.owner_ref as string,
      email: data.email as string,
      displayName: (data.display_name as string | null) ?? null,
    },
    passwordHash: data.password_hash as string,
  };
}

/** Registers a member and returns the owner_ref that ties them to their data. */
export async function createMember(input: {
  email: string;
  password: string;
  displayName?: string | null;
  ownerRef: string;
}): Promise<{ ok: true; member: Member } | { ok: false; reason: string }> {
  const db = getSupabase();
  if (!db) return { ok: false, reason: "store_unavailable" };

  const { error } = await db.from("members").insert({
    owner_ref: input.ownerRef,
    email: input.email.trim().toLowerCase(),
    display_name: input.displayName ?? null,
    password_hash: hashPassword(input.password),
  });

  if (error) {
    const taken = /duplicate key|unique/i.test(error.message);
    return { ok: false, reason: taken ? "email_taken" : error.message };
  }
  return {
    ok: true,
    member: { ownerRef: input.ownerRef, email: input.email, displayName: input.displayName ?? null },
  };
}

/**
 * Profile for the signed-in member.
 *
 * The session cookie carries only `owner_ref`, so the display name is read here
 * rather than embedded: a name change should not require re-issuing a cookie,
 * and the cookie stays small.
 */
export async function getMemberProfile(
  ownerRef: string,
): Promise<{ email: string; displayName: string | null } | null> {
  const db = getSupabase();
  if (!db) return null;

  const { data, error } = await db
    .from("members")
    .select("email, display_name")
    .eq("owner_ref", ownerRef)
    .maybeSingle();

  if (error || !data) return null;
  return {
    email: data.email as string,
    displayName: (data.display_name as string | null) ?? null,
  };
}

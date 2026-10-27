import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_SECONDS,
  createMember,
  findMember,
  issueSession,
  verifyPassword,
} from "@/lib/auth/member";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { email?: unknown; password?: unknown; mode?: unknown; displayName?: unknown };

/** In-memory throttle; a Worker restart clears it, which is acceptable for login. */
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function clientKey(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function throttled(key: string, now: number): boolean {
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { count: 0, first: now });
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string, now: number) {
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now });
    return;
  }
  entry.count += 1;
}

/**
 * Signs a member in, or registers one.
 *
 * `owner_ref` is the visitor hash of *this* browser, so a new account is
 * immediately joined to any tokens, store or affiliate code already created
 * here. That is the only identity the rest of the system knows; asking the user
 * for it would be asking for a hash.
 */
export async function POST(request: NextRequest) {
  const key = clientKey(request);
  const now = Date.now();
  if (throttled(key, now)) {
    return NextResponse.json({ code: "too_many_attempts" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const displayName =
    typeof body?.displayName === "string" && body.displayName.trim().length > 0
      ? body.displayName.trim().slice(0, 80)
      : null;
  const mode = body?.mode === "register" ? "register" : "login";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ code: "email_invalid" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ code: "password_too_short", min: 8 }, { status: 400 });
  }

  const ownerRef = identifyVisitor(request.headers).visitorKey;

  if (mode === "register") {
    const created = await createMember({ email, password, displayName, ownerRef });
    if (!created.ok) {
      const taken = created.reason === "email_taken";
      return NextResponse.json(
        { code: taken ? "email_taken" : "register_failed" },
        { status: taken ? 409 : 500 },
      );
    }
    return withSession(created.member.ownerRef, email, now);
  }

  const found = await findMember(email);
  if (!found.ok) {
    // Same response for unknown email and wrong password: distinguishing them
    // tells an attacker which addresses have accounts.
    recordFailure(key, now);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return NextResponse.json({ code: "invalid_credentials" }, { status: 401 });
  }
  if (!verifyPassword(password, found.passwordHash)) {
    recordFailure(key, now);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return NextResponse.json({ code: "invalid_credentials" }, { status: 401 });
  }

  attempts.delete(key);
  return withSession(found.member.ownerRef, found.member.email, now);
}

function withSession(ownerRef: string, email: string, now: number) {
  const response = NextResponse.json({ ok: true, email });
  response.cookies.set(SESSION_COOKIE, issueSession(ownerRef, now), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return response;
}

/** Sign out. */
export async function DELETE() {
  const jar = await cookies();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  void jar;
  return response;
}

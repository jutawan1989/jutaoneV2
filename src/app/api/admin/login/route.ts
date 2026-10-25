import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  adminMisconfiguredReason,
  issueSession,
  passwordMatches,
} from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Very small in-memory throttle; a Worker isolate restart clears it. */
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

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

export async function POST(request: NextRequest) {
  const misconfigured = adminMisconfiguredReason();
  if (misconfigured) {
    return NextResponse.json({ code: "admin_not_configured" }, { status: 503 });
  }

  const key = clientKey(request);
  const now = Date.now();
  if (throttled(key, now)) {
    return NextResponse.json({ code: "too_many_attempts" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";

  if (!passwordMatches(password)) {
    recordFailure(key, now);
    // Deliberately slow: a password on a page that spends API credit should not
    // be brute-forceable at machine speed.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return NextResponse.json({ code: "invalid_password" }, { status: 401 });
  }

  attempts.delete(key);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, issueSession(now), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_SECONDS,
  });
  return response;
}

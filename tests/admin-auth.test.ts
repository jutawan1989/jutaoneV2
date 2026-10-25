import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_SECONDS,
  adminConfigured,
  adminMisconfiguredReason,
  issueSession,
  passwordMatches,
  verifySession,
  authorisedByHeader,
} from "@/lib/admin/auth";

const STRONG = "correct-horse-battery-staple";

describe("admin password handling", () => {
  beforeEach(() => {
    process.env.ADMIN_TEST_PASSWORD = STRONG;
  });
  afterEach(() => {
    delete process.env.ADMIN_TEST_PASSWORD;
  });

  it("refuses to enable the route on a short password", () => {
    process.env.ADMIN_TEST_PASSWORD = "boss1";
    expect(adminConfigured()).toBe(false);
    expect(adminMisconfiguredReason()).toMatch(/at least 12/);
  });

  it("refuses to enable the route on a missing password", () => {
    delete process.env.ADMIN_TEST_PASSWORD;
    expect(adminConfigured()).toBe(false);
    expect(adminMisconfiguredReason()).toMatch(/not set/);
  });

  it("enables the route on a strong password", () => {
    expect(adminConfigured()).toBe(true);
    expect(adminMisconfiguredReason()).toBeNull();
  });

  it("matches only the exact password", () => {
    expect(passwordMatches(STRONG)).toBe(true);
    expect(passwordMatches(STRONG + " ")).toBe(false);
    expect(passwordMatches("")).toBe(false);
    expect(passwordMatches("Correct-horse-battery-staple")).toBe(false);
  });
});

describe("admin session token", () => {
  beforeEach(() => {
    process.env.ADMIN_TEST_PASSWORD = STRONG;
  });
  afterEach(() => {
    delete process.env.ADMIN_TEST_PASSWORD;
  });

  it("accepts a freshly issued session", () => {
    expect(verifySession(issueSession())).toBe(true);
  });

  it("rejects a missing or malformed token", () => {
    expect(verifySession(undefined)).toBe(false);
    expect(verifySession("")).toBe(false);
    expect(verifySession("garbage")).toBe(false);
    expect(verifySession("123")).toBe(false);
    expect(verifySession("abc.def")).toBe(false);
  });

  it("rejects a tampered expiry", () => {
    const token = issueSession();
    const [, signature] = token.split(".");
    const farFuture = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
    expect(verifySession(`${farFuture}.${signature}`)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const [payload] = issueSession().split(".");
    const fake = "a".repeat(64);
    expect(verifySession(`${payload}.${fake}`)).toBe(false);
  });

  it("expires after the session window", () => {
    const now = Date.now();
    const token = issueSession(now);
    expect(verifySession(token, now)).toBe(true);
    expect(verifySession(token, now + (ADMIN_SESSION_SECONDS + 1) * 1000)).toBe(false);
  });

  it("invalidates every session when the password rotates", () => {
    const token = issueSession();
    process.env.ADMIN_TEST_PASSWORD = `${STRONG}-rotated`;
    expect(verifySession(token)).toBe(false);
  });
});

describe("header auth for scripting", () => {
  beforeEach(() => {
    process.env.ADMIN_TEST_PASSWORD = STRONG;
  });
  afterEach(() => {
    delete process.env.ADMIN_TEST_PASSWORD;
  });

  it("accepts a bearer token", () => {
    const headers = new Headers({ authorization: `Bearer ${STRONG}` });
    expect(authorisedByHeader(headers)).toBe(true);
  });

  it("accepts the x-admin-token header", () => {
    expect(authorisedByHeader(new Headers({ "x-admin-token": STRONG }))).toBe(true);
  });

  it("rejects a wrong or absent token", () => {
    expect(authorisedByHeader(new Headers({ authorization: "Bearer nope" }))).toBe(false);
    expect(authorisedByHeader(new Headers())).toBe(false);
  });
});

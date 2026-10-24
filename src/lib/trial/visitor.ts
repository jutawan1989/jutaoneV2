import { createHash } from "node:crypto";

let warnedAboutSalt = false;

function salt(): string {
  const value = process.env.VISITOR_HASH_SALT;
  if (value && value.length >= 16) return value;
  if (!warnedAboutSalt && process.env.NODE_ENV === "production") {
    warnedAboutSalt = true;
    console.warn(
      "[jutaone] VISITOR_HASH_SALT is missing or too short. Set a 32+ char random value in production.",
    );
  }
  return value ?? "jutaone-dev-salt-do-not-use-in-production";
}

function sha256(value: string): string {
  return createHash("sha256").update(`${salt()}:${value}`).digest("hex");
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "0.0.0.0"
  );
}

/**
 * Device fingerprint computed entirely server-side from request headers, so it
 * survives cache/cookie clearing. No PII is stored: only salted hashes.
 */
export function getDeviceHash(headers: Headers): string {
  const parts = [
    headers.get("user-agent") ?? "",
    headers.get("sec-ch-ua") ?? "",
    headers.get("sec-ch-ua-platform") ?? "",
    headers.get("sec-ch-ua-mobile") ?? "",
    headers.get("accept-language") ?? "",
  ];
  return sha256(`device|${parts.join("|")}`);
}

export type Visitor = {
  ipHash: string;
  deviceHash: string;
  /** Limits are enforced against this key. */
  visitorKey: string;
};

export function identifyVisitor(headers: Headers): Visitor {
  const ipHash = sha256(`ip|${getClientIp(headers)}`);
  const deviceHash = getDeviceHash(headers);
  return {
    ipHash,
    deviceHash,
    visitorKey: sha256(`visitor|${ipHash}|${deviceHash}`),
  };
}

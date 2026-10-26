import { generateKeyPairSync, createSign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyCallbackSignature } from "@/lib/payment/chip";

/**
 * Strict enforcement of the Chip RSA-SHA256 signature.
 *
 * These cases are the ones that matter before real money moves: an attacker
 * who can POST to the webhook must not be able to credit themselves tokens.
 */
describe("webhook signature enforcement", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const body = JSON.stringify({
    id: "pur_e2e",
    status: "paid",
    reference: "JO-E2E",
    purchase: { total: 470, currency: "MYR" },
  });

  function sign(payload: string): string {
    const s = createSign("RSA-SHA256");
    s.update(Buffer.from(payload));
    s.end();
    return s.sign(privateKey, "base64");
  }

  beforeEach(() => {
    process.env.CHIP_PUBLIC_KEY = publicKey;
    delete process.env.CHIP_ALLOW_UNSIGNED_CALLBACKS;
  });

  afterEach(() => {
    delete process.env.CHIP_PUBLIC_KEY;
    delete process.env.CHIP_ALLOW_UNSIGNED_CALLBACKS;
  });

  it("accepts a correctly signed body", () => {
    expect(verifyCallbackSignature(body, sign(body))).toEqual({ ok: true });
  });

  it("rejects a request with no signature header", () => {
    const result = verifyCallbackSignature(body, null);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("missing signature");
  });

  it("rejects a forged base64 signature", () => {
    expect(verifyCallbackSignature(body, Buffer.from("forged").toString("base64")).ok).toBe(false);
  });

  it("rejects a signature made with a different private key", () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const s = createSign("RSA-SHA256");
    s.update(Buffer.from(body));
    s.end();
    const foreign = s.sign(other.privateKey, "base64");
    expect(verifyCallbackSignature(body, foreign).ok).toBe(false);
  });

  it("rejects a tampered body carrying a valid signature for the original", () => {
    const signature = sign(body);
    const tampered = body.replace("470", "1");
    expect(verifyCallbackSignature(tampered, signature).ok).toBe(false);
  });

  it("fails closed when no public key is configured", () => {
    delete process.env.CHIP_PUBLIC_KEY;
    expect(verifyCallbackSignature(body, sign(body)).ok).toBe(false);
  });
});

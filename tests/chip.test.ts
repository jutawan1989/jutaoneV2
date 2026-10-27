import { generateKeyPairSync, createSign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chipConfigured, createTopUpSession, generateReference, InvalidCustomerEmailError, parseCustomerEmail, verifyCallbackSignature } from "@/lib/payment/chip";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function sign(payload: string): string {
  const signer = createSign("RSA-SHA256");
  signer.update(Buffer.from(payload));
  signer.end();
  return signer.sign(privateKey, "base64");
}

describe("Chip webhook verification", () => {
  const originalPublicKey = process.env.CHIP_PUBLIC_KEY;

  beforeEach(() => {
    process.env.CHIP_PUBLIC_KEY = publicKey;
  });

  afterEach(() => {
    if (originalPublicKey === undefined) delete process.env.CHIP_PUBLIC_KEY;
    else process.env.CHIP_PUBLIC_KEY = originalPublicKey;
  });

  it("accepts a payload signed with the matching private key", () => {
    const payload = JSON.stringify({ id: "pur_1", status: "paid" });
    expect(verifyCallbackSignature(payload, sign(payload))).toEqual({ ok: true });
  });

  it("rejects a tampered payload", () => {
    const payload = JSON.stringify({ id: "pur_1", status: "paid" });
    const signature = sign(payload);
    const tampered = JSON.stringify({ id: "pur_1", status: "refunded" });
    expect(verifyCallbackSignature(tampered, signature).ok).toBe(false);
  });

  it("rejects a signature made with a different key", () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const signer = createSign("RSA-SHA256");
    const payload = JSON.stringify({ id: "pur_1", status: "paid" });
    signer.update(Buffer.from(payload));
    signer.end();
    const foreign = signer.sign(other.privateKey, "base64");
    expect(verifyCallbackSignature(payload, foreign).ok).toBe(false);
  });

  it("rejects a missing signature header", () => {
    const result = verifyCallbackSignature("{}", null);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("missing signature");
  });

  it("rejects unsigned callbacks when no public key is configured", () => {
    delete process.env.CHIP_PUBLIC_KEY;
    delete process.env.CHIP_ALLOW_UNSIGNED_CALLBACKS;
    const result = verifyCallbackSignature("{}", "abc");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("CHIP_PUBLIC_KEY");
  });

  it("only accepts unsigned callbacks with an explicit local opt-in", () => {
    delete process.env.CHIP_PUBLIC_KEY;
    process.env.CHIP_ALLOW_UNSIGNED_CALLBACKS = "1";
    try {
      expect(verifyCallbackSignature("{}", null).ok).toBe(true);
    } finally {
      delete process.env.CHIP_ALLOW_UNSIGNED_CALLBACKS;
    }
  });

  it("reads the key from a single-line env value with escaped newlines", () => {
    process.env.CHIP_PUBLIC_KEY = publicKey.replace(/\n/g, "\\n");
    const payload = JSON.stringify({ id: "pur_2", status: "paid" });
    expect(verifyCallbackSignature(payload, sign(payload))).toEqual({ ok: true });
  });
});

describe("Chip configuration", () => {
  const originalKey = process.env.CHIP_API_KEY;
  const originalBrand = process.env.CHIP_BRAND_ID;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.CHIP_API_KEY;
    else process.env.CHIP_API_KEY = originalKey;
    if (originalBrand === undefined) delete process.env.CHIP_BRAND_ID;
    else process.env.CHIP_BRAND_ID = originalBrand;
  });

  it("is only configured when both the key and the brand id are present", () => {
    process.env.CHIP_API_KEY = "key";
    delete process.env.CHIP_BRAND_ID;
    expect(chipConfigured()).toBe(false);

    process.env.CHIP_BRAND_ID = "brand";
    expect(chipConfigured()).toBe(true);
  });

  it("builds unique, locale-tagged references", () => {
    const first = generateReference("ms");
    const second = generateReference("ms");
    expect(first).not.toBe(second);
    expect(first.startsWith("JO-MS-")).toBe(true);
    expect(first.length).toBeLessThan(64);
  });
});

describe("customer email parsing (Chip OTP destination)", () => {
  it("accepts a real customer address, trimmed", () => {
    expect(parseCustomerEmail("  Boss@Example.com  ")).toBe("Boss@Example.com");
  });

  it("rejects blanks, non-emails, and non-strings", () => {
    expect(parseCustomerEmail("")).toBeNull();
    expect(parseCustomerEmail("not-an-email")).toBeNull();
    expect(parseCustomerEmail("a@b")).toBeNull();
    expect(parseCustomerEmail(undefined)).toBeNull();
    expect(parseCustomerEmail(123)).toBeNull();
  });
});

describe("top-up session email (no dummy fallback)", () => {
  const originalKey = process.env.CHIP_API_KEY;
  const originalBrand = process.env.CHIP_BRAND_ID;

  beforeEach(() => {
    process.env.CHIP_API_KEY = "test-key";
    process.env.CHIP_BRAND_ID = "test-brand";
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.CHIP_API_KEY;
    else process.env.CHIP_API_KEY = originalKey;
    if (originalBrand === undefined) delete process.env.CHIP_BRAND_ID;
    else process.env.CHIP_BRAND_ID = originalBrand;
  });

  it("throws InvalidCustomerEmailError instead of a dummy address", async () => {
    await expect(
      createTopUpSession({ locale: "ms", region: "MY", variant: "A", origin: "https://x.test", customerEmail: "not-an-email" }),
    ).rejects.toBeInstanceOf(InvalidCustomerEmailError);
    await expect(
      createTopUpSession({ locale: "ms", region: "MY", variant: "A", origin: "https://x.test", customerEmail: undefined }),
    ).rejects.toBeInstanceOf(InvalidCustomerEmailError);
  });
});

import { describe, expect, it } from "vitest";
import {
  WHATSAPP_DIGITS,
  WHATSAPP_ID_DIGITS,
  WHATSAPP_MY_DIGITS,
  WHATSAPP_NUMBER_INTL,
  WHATSAPP_NUMBER_SHORT,
  WHATSAPP_TEL_URL,
  whatsappDigitsFor,
  whatsappShortFor,
  whatsappUrl,
} from "@/lib/contact";

describe("official WhatsApp contact", () => {
  it("uses the official JutaOne.Biz Malaysia number as default", () => {
    expect(WHATSAPP_MY_DIGITS).toBe("601149655880");
    expect(WHATSAPP_DIGITS).toBe("601149655880");
    expect(WHATSAPP_NUMBER_SHORT).toBe("011-4965 5880");
    expect(WHATSAPP_NUMBER_INTL).toBe("+6011-4965 5880");
    expect(WHATSAPP_TEL_URL).toBe("tel:+601149655880");
    expect(WHATSAPP_ID_DIGITS).toBe("6287892768208");
  });

  it("routes ms/en to Malaysia and id to Indonesia", () => {
    expect(whatsappDigitsFor("ms")).toBe("601149655880");
    expect(whatsappDigitsFor("en")).toBe("601149655880");
    expect(whatsappDigitsFor(undefined)).toBe("601149655880");
    expect(whatsappDigitsFor("id")).toBe("6287892768208");
    expect(whatsappShortFor("id")).toBe("0878-9276 8208");
    expect(whatsappShortFor("ms")).toBe("011-4965 5880");
  });

  it("builds the Boss-specified wa.me link for the Malay prefill", () => {
    const url = whatsappUrl(
      "Hai JutaOne.Biz, saya berminat untuk tahu lebih lanjut tentang token AI.",
    );
    expect(url.startsWith("https://wa.me/601149655880?text=")).toBe(true);
    expect(url).toContain(encodeURIComponent("Hai JutaOne.Biz"));
    expect(url).toContain("token%20AI");
  });

  it("builds the Indonesian wa.me link when locale is id", () => {
    const url = whatsappUrl("Hai", "id");
    expect(url.startsWith("https://wa.me/6287892768208?text=")).toBe(true);
  });

  it("encodes prefill text so the link never breaks", () => {
    expect(whatsappUrl("Hi! I'd like & more?")).toBe(
      "https://wa.me/601149655880?text=Hi!%20I'd%20like%20%26%20more%3F",
    );
  });
});

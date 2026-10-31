import { describe, expect, it } from "vitest";
import {
  WHATSAPP_DIGITS,
  WHATSAPP_NUMBER_INTL,
  WHATSAPP_NUMBER_SHORT,
  WHATSAPP_TEL_URL,
  whatsappUrl,
} from "@/lib/contact";

describe("official WhatsApp contact", () => {
  it("uses the official JutaOne.Biz number", () => {
    expect(WHATSAPP_DIGITS).toBe("601155919344");
    expect(WHATSAPP_NUMBER_SHORT).toBe("011-5591 9344");
    expect(WHATSAPP_NUMBER_INTL).toBe("+6011-5591 9344");
    expect(WHATSAPP_TEL_URL).toBe("tel:+601155919344");
  });

  it("builds the Boss-specified wa.me link for the Malay prefill", () => {
    const url = whatsappUrl(
      "Hai JutaOne.Biz, saya berminat untuk tahu lebih lanjut tentang token AI.",
    );
    expect(url.startsWith("https://wa.me/601155919344?text=")).toBe(true);
    expect(url).toContain(encodeURIComponent("Hai JutaOne.Biz"));
    expect(url).toContain("token%20AI");
  });

  it("encodes prefill text so the link never breaks", () => {
    expect(whatsappUrl("Hi! I'd like & more?")).toBe(
      "https://wa.me/601155919344?text=Hi!%20I'd%20like%20%26%20more%3F",
    );
  });
});

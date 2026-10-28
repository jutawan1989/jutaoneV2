import { describe, expect, it } from "vitest";
import { isDirectImageUrl, isSafeImageUrl, normalizeImageUrl, productInitials, validateImageForSubmit } from "@/lib/product-image";

describe("product-image helpers", () => {
  it("normalises Google Drive share links to direct thumbnails", () => {
    expect(normalizeImageUrl("https://drive.google.com/file/d/ABC123xyz/view?usp=sharing")).toBe(
      "https://drive.google.com/thumbnail?id=ABC123xyz&sz=w1000",
    );
  });
  it("rejects javascript: URLs", () => {
    expect(isSafeImageUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeImageUrl("https://example.com/a.jpg")).toBe(true);
  });
  it("flags Shopee short links as non-direct", () => {
    expect(isDirectImageUrl("https://s.shopee.com.my/9APkpBx0mS")).toBe(false);
    expect(isDirectImageUrl("https://images.unsplash.com/photo-123?w=800")).toBe(true);
    expect(isDirectImageUrl("https://example.com/a.jpg")).toBe(true);
    expect(isDirectImageUrl("https://example.com/product")).toBe(false);
  });
  it("accepts Supabase storage public URLs", () => {
    expect(isDirectImageUrl("https://xyz.supabase.co/storage/v1/object/public/product-images/a.jpg")).toBe(true);
  });
  it("builds initials", () => {
    expect(productInitials("Kek Lapis")).toBe("KL");
    expect(productInitials("Motul")).toBe("MO");
    expect(productInitials("")).toBe("JO");
  });
});

describe("validateImageForSubmit", () => {
  it("allows empty (no image)", () => {
    expect(validateImageForSubmit("")).toEqual({ ok: true, url: null });
    expect(validateImageForSubmit("   ")).toEqual({ ok: true, url: null });
  });
  it("rejects malformed and blob/data URLs", () => {
    expect(validateImageForSubmit("notaurl")).toEqual({ ok: false, code: "invalid_url" });
    expect(validateImageForSubmit("blob:http://x/123")).toEqual({ ok: false, code: "invalid_url" });
    expect(validateImageForSubmit("javascript:alert(1)")).toEqual({ ok: false, code: "invalid_url" });
  });
  it("rejects page links that would render broken", () => {
    expect(validateImageForSubmit("https://s.shopee.com.my/9APkpBx0mS")).toEqual({
      ok: false,
      code: "not_direct",
    });
    expect(validateImageForSubmit("https://example.com/product")).toEqual({
      ok: false,
      code: "not_direct",
    });
  });
  it("accepts direct files, Unsplash, Drive shares and storage URLs", () => {
    expect(validateImageForSubmit("https://example.com/a.jpg")).toEqual({
      ok: true,
      url: "https://example.com/a.jpg",
    });
    expect(validateImageForSubmit("https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800").ok).toBe(true);
    const drive = validateImageForSubmit("https://drive.google.com/file/d/ABC123xyz/view?usp=sharing");
    expect(drive).toEqual({
      ok: true,
      url: "https://drive.google.com/thumbnail?id=ABC123xyz&sz=w1000",
    });
  });
});

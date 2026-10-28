import { describe, expect, it } from "vitest";
import { isDirectImageUrl, isSafeImageUrl, normalizeImageUrl, productInitials } from "@/lib/product-image";

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

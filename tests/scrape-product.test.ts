import { describe, expect, it } from "vitest";
import { extractProductFromHtml } from "@/lib/scrape-product";

describe("extractProductFromHtml", () => {
  it("prefers JSON-LD image over og:image", () => {
    const html = `
      <html><head>
      <script type="application/ld+json">{"@type":"Product","name":"Kek Lapis","image":"https://example.com/jsonld.jpg","offers":{"price":"45.00"}}</script>
      <meta property="og:image" content="https://example.com/og.jpg" />
      <meta name="twitter:image" content="https://example.com/tw.jpg" />
      </head></html>`;
    const out = extractProductFromHtml(html, "https://shopee.com.my/p/1");
    expect(out.imageUrl).toBe("https://example.com/jsonld.jpg");
    expect(out.source).toBe("json-ld");
    expect(out.name).toBe("Kek Lapis");
    expect(out.price).toBe("45.00");
  });

  it("falls back to og:image then twitter:image", () => {
    const ogOnly = `<html><head><meta property="og:image" content="https://example.com/og.jpg" /><meta property="og:title" content="Batik" /></head></html>`;
    expect(extractProductFromHtml(ogOnly, "https://x.test/").imageUrl).toBe("https://example.com/og.jpg");
    expect(extractProductFromHtml(ogOnly, "https://x.test/").source).toBe("og:image");

    const twOnly = `<html><head><meta name="twitter:image" content="https://example.com/tw.png" /></head></html>`;
    expect(extractProductFromHtml(twOnly, "https://x.test/").imageUrl).toBe("https://example.com/tw.png");
    expect(extractProductFromHtml(twOnly, "https://x.test/").source).toBe("twitter:image");
  });

  it("handles JSON-LD arrays and relative URLs", () => {
    const html = `<html><head><script type="application/ld+json">[{"@type":"Product","image":["/file/abc123"]}]</script></head></html>`;
    const out = extractProductFromHtml(html, "https://down-my.img.susercontent.com/");
    expect(out.imageUrl).toBe("https://down-my.img.susercontent.com/file/abc123");
  });

  it("returns null image when nothing found", () => {
    const out = extractProductFromHtml(`<html><head><title>Hi</title></head></html>`, "https://x.test/");
    expect(out.imageUrl).toBeNull();
    expect(out.source).toBeNull();
  });

  it("accepts Shopee CDN images without a file extension", () => {
    const html = `<html><head><meta property="og:image" content="https://down-my.img.susercontent.com/file/abc123" /></head></html>`;
    const out = extractProductFromHtml(html, "https://shopee.com.my/p/1");
    expect(out.imageUrl).toBe("https://down-my.img.susercontent.com/file/abc123");
    expect(out.source).toBe("og:image");
  });
});

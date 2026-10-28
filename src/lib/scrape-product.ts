/**
 * Server + client safe HTML → product extraction.
 *
 * Priority:
 *  1. JSON-LD (<script type="application/ld+json">) `image` field
 *  2. Open Graph (<meta property="og:image">)
 *  3. Twitter (<meta name="twitter:image">)
 *
 * No external HTML parser — uses targeted regexes so the worker bundle
 * stays small and Cloudflare-compatible.
 */

export type ScrapedProduct = {
  imageUrl: string | null;
  name: string | null;
  price: string | null;
  source: "json-ld" | "og:image" | "twitter:image" | null;
};

function resolveUrl(raw: string, baseUrl: string): string | null {
  const value = raw.trim().replace(/^&amp;/, "&");
  if (!value) return null;
  // Decode common HTML entities in attribute values.
  const decoded = value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  try {
    const url = new URL(decoded, baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function pickImageField(image: unknown): string | null {
  if (typeof image === "string" && image.trim()) return image.trim();
  if (Array.isArray(image)) {
    for (const item of image) {
      const picked = pickImageField(item);
      if (picked) return picked;
    }
    return null;
  }
  if (image && typeof image === "object") {
    const obj = image as Record<string, unknown>;
    if (typeof obj.url === "string" && obj.url.trim()) return obj.url.trim();
    if (typeof obj.contentUrl === "string" && obj.contentUrl.trim())
      return obj.contentUrl.trim();
  }
  return null;
}

function pickPriceField(offers: unknown): string | null {
  if (offers == null) return null;
  if (typeof offers === "string" || typeof offers === "number") {
    const s = String(offers).trim();
    return s ? s : null;
  }
  if (Array.isArray(offers)) {
    for (const item of offers) {
      const picked = pickPriceField(item);
      if (picked) return picked;
    }
    return null;
  }
  if (typeof offers === "object") {
    const obj = offers as Record<string, unknown>;
    for (const key of ["price", "lowPrice", "highPrice", "priceSpecification"]) {
      const picked = pickPriceField(obj[key]);
      if (picked) return picked;
    }
    // priceSpecification shape: { price: "12.00" }
  }
  return null;
}

function walkJsonLd(
  node: unknown,
  found: { imageUrl: string | null; name: string | null; price: string | null },
) {
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, found);
    return;
  }
  const obj = node as Record<string, unknown>;
  // @graph container (Yoast / Next SEO style)
  if (obj["@graph"] !== undefined) walkJsonLd(obj["@graph"], found);
  if (!found.imageUrl && obj.image !== undefined) {
    const picked = pickImageField(obj.image);
    if (picked) found.imageUrl = picked;
  }
  if (!found.name && typeof obj.name === "string" && obj.name.trim()) {
    found.name = obj.name.trim().slice(0, 200);
  }
  if (!found.price && obj.offers !== undefined) {
    const picked = pickPriceField(obj.offers);
    if (picked) found.price = String(picked).trim().slice(0, 32);
  }
  // Some sites nest price directly
  if (!found.price && (typeof obj.price === "string" || typeof obj.price === "number")) {
    const s = String(obj.price).trim();
    if (s) found.price = s.slice(0, 32);
  }
  // Recurse into common containers without overwriting first wins.
  for (const key of ["mainEntity", "itemListElement", "hasPart"]) {
    if (obj[key] !== undefined) walkJsonLd(obj[key], found);
  }
}

/** Extract all JSON-LD blocks and return first image/name/price found. */
function extractJsonLd(html: string): {
  imageUrl: string | null;
  name: string | null;
  price: string | null;
} {
  const found = { imageUrl: null as string | null, name: null as string | null, price: null as string | null };
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      walkJsonLd(parsed, found);
    } catch {
      // Some sites emit invalid JSON-LD (trailing commas, HTML entities) — skip block.
      continue;
    }
    if (found.imageUrl) break;
  }
  return found;
}

/** Find the content attribute of the first <meta> tag whose property/name equals `key`. */
function extractMetaContent(html: string, key: string): string | null {
  const tagRe = /<meta\s[^>]*?>/gi;
  const lowerKey = key.toLowerCase();
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRe.exec(html)) !== null) {
    const tag = tagMatch[0];
    const attrRe = /(\w+)\s*=\s*["']([^"']*)["']/g;
    let attrMatch: RegExpExecArray | null;
    let tagKey: string | null = null;
    let content: string | null = null;
    while ((attrMatch = attrRe.exec(tag)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrValue = attrMatch[2];
      if ((attrName === "property" || attrName === "name") && attrValue.toLowerCase() === lowerKey) {
        tagKey = attrValue;
      }
      if (attrName === "content") content = attrValue;
    }
    if (tagKey && content && content.trim()) return content.trim();
  }
  return null;
}

function extractTitle(html: string): string | null {
  const ogTitle = extractMetaContent(html, "og:title");
  if (ogTitle) return ogTitle.slice(0, 200);
  const twTitle = extractMetaContent(html, "twitter:title");
  if (twTitle) return twTitle.slice(0, 200);
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m?.[1]) {
    const text = m[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    if (text) return text.slice(0, 200);
  }
  return null;
}

function extractPrice(html: string): string | null {
  const keys = [
    "og:price:amount",
    "product:price:amount",
    "twitter:data1",
    "product:pretax_price:amount",
  ];
  for (const key of keys) {
    const value = extractMetaContent(html, key);
    if (value) {
      // twitter:data1 is often "RM 45.00" — keep digits, dots and commas.
      const numeric = value.replace(/[^0-9.,]/g, "").trim();
      if (numeric) return numeric.slice(0, 32);
      return value.trim().slice(0, 32);
    }
  }
  return null;
}

export function extractProductFromHtml(html: string, baseUrl: string): ScrapedProduct {
  // Priority 1: JSON-LD
  const jsonLd = extractJsonLd(html);
  if (jsonLd.imageUrl) {
    const resolved = resolveUrl(jsonLd.imageUrl, baseUrl);
    if (resolved) {
      return {
        imageUrl: resolved,
        name: jsonLd.name ?? extractTitle(html),
        price: jsonLd.price ?? extractPrice(html),
        source: "json-ld",
      };
    }
  }

  // Priority 2: Open Graph
  const ogImage = extractMetaContent(html, "og:image");
  if (ogImage) {
    const resolved = resolveUrl(ogImage, baseUrl);
    if (resolved) {
      return {
        imageUrl: resolved,
        name: jsonLd.name ?? extractTitle(html),
        price: jsonLd.price ?? extractPrice(html),
        source: "og:image",
      };
    }
  }

  // Priority 3: Twitter
  const twImage = extractMetaContent(html, "twitter:image");
  if (twImage) {
    const resolved = resolveUrl(twImage, baseUrl);
    if (resolved) {
      return {
        imageUrl: resolved,
        name: jsonLd.name ?? extractTitle(html),
        price: jsonLd.price ?? extractPrice(html),
        source: "twitter:image",
      };
    }
  }

  return {
    imageUrl: null,
    name: jsonLd.name ?? extractTitle(html),
    price: jsonLd.price ?? extractPrice(html),
    source: null,
  };
}

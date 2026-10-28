import { NextResponse, type NextRequest } from "next/server";
import { extractProductFromHtml } from "@/lib/scrape-product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;
const RAPID_TIMEOUT_MS = 15_000;

/** Basic SSRF guard: refuse loopback / link-local / private-range targets. */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host === "metadata.google.internal") return true;
  if (host === "::1" || host === "[::1]") return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^0\.0\.0\.0$/.test(host)) return true;
  // Decimal / octal / hex IP tricks that still resolve to loopback.
  if (/^(2130706433|0x7f000001)$/.test(host)) return true;
  return false;
}

function shopeeCountry(hostname: string): string | null {
  const host = hostname.toLowerCase();
  if (host.includes("shopee.co.id")) return "id";
  if (host.includes("shopee.com.my") || host === "s.shopee.com.my") return "my";
  if (host.includes("shopee.sg")) return "sg";
  if (host.includes("shopee.")) return "sg";
  return null;
}

/**
 * RapidAPI Shopee scraper (best-shopee-scraper-free-1000-calls):
 * GET /products/details?product={full product url}.
 *
 * Two realities shape this function:
 * 1. The vendor only serves SG catalogue (MY/ID links 404 "not found").
 *    So: short links (s.shopee.*) are resolved server-side to the full
 *    product URL first — the vendor rejects short links outright.
 * 2. Response image lives under `data.images[]` (array of CDN URLs) or
 *    `data.image`. Every known shape is tried; null when nothing usable.
 */
async function scrapeViaRapidApi(
  productUrl: string,
): Promise<{ imageUrl: string; name: string | null; price: string | null } | null> {
  const key = process.env.RAPIDAPI_KEY ?? "";
  if (!key) return null;
  const host = process.env.RAPIDAPI_SHOPEE_HOST ?? "best-shopee-scraper-free-1000-calls.p.rapidapi.com";

  // Short links carry no shop/item ids — resolve to the full product URL.
  const fullUrl = await resolveShortLink(productUrl);

  let response: Response;
  try {
    const endpoint = `https://${host}/products/details?product=${encodeURIComponent(fullUrl)}`;
    response = await fetch(endpoint, {
      method: "GET",
      headers: { "x-rapidapi-key": key, "x-rapidapi-host": host },
      signal: AbortSignal.timeout(RAPID_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[jutaone] rapidapi shopee unreachable", (error as Error).message.slice(0, 120));
    return null;
  }

  if (!response.ok) {
    console.error("[jutaone] rapidapi shopee failed", response.status);
    return null;
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const data = extractDataNode(payload);
  if (!data) return null;

  const imageUrl = firstImageUrl([data.images, data.image, data.thumbnail, data.main_image]);
  if (!imageUrl) return null;

  const name =
    (typeof data.name === "string" && data.name.trim()) ||
    (typeof data.title === "string" && data.title.trim()) ||
    null;
  const price =
    (typeof data.price === "string" && data.price.trim()) ||
    (typeof data.price === "number" ? String(data.price) : null) ||
    (typeof data.final_price === "number" ? String(data.final_price) : null) ||
    null;
  return {
    imageUrl,
    name: name?.slice(0, 200) ?? null,
    price: price?.slice(0, 32) ?? null,
  };
}

/** Follows a short link (s.shopee.*) to the full product URL. Pass-through otherwise. */
async function resolveShortLink(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host.startsWith("s.shopee.")) return normaliseProductUrl(url);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10_000),
    });
    return normaliseProductUrl(response.url || url);
  } catch {
    return normaliseProductUrl(url);
  }
}

/**
 * Normalises a Shopee product URL to the vendor-accepted shape:
 * strip tracking params, then rewrite `/<slug>/<shop>/<item>` to
 * `/<slug>-i.<shop>.<item>`. Short-circuit safe: non-Shopee URLs pass
 * through untouched.
 */
function normaliseProductUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!parsed.hostname.toLowerCase().includes("shopee.")) return url;
  const match = parsed.pathname.match(/^\/([^/]+)\/(\d+)\/(\d+)/);
  if (!match) return `${parsed.origin}${parsed.pathname}`;
  const [, slug, shop, item] = match;
  return `${parsed.origin}/${slug}-i.${shop}.${item}`;
}

/** Vendor wraps the product in `data` (or returns it flat on some versions). */
function extractDataNode(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const data = record.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return record;
}

function firstImageUrl(value: unknown): string | null {
  if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && /^https?:\/\//i.test(item.trim())) return item.trim();
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        for (const key of ["url", "image", "src"]) {
          if (typeof obj[key] === "string" && /^https?:\/\//i.test((obj[key] as string).trim())) {
            return (obj[key] as string).trim();
          }
        }
      }
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  let rawUrl: unknown = null;
  try {
    const body = await request.json();
    rawUrl = body?.url;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_url" }, { status: 400 });
  }

  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return NextResponse.json({ ok: false, code: "invalid_url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl.trim());
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_url" }, { status: 400 });
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ ok: false, code: "invalid_url" }, { status: 400 });
  }
  if (isBlockedHost(target.hostname)) {
    return NextResponse.json({ ok: false, code: "invalid_url" }, { status: 400 });
  }

  // Shopee links: dedicated scraper first (Shopee bot-walls plain fetch),
  // with Open Graph fallback below if the vendor has no image.
  if (shopeeCountry(target.hostname)) {
    const scraped = await scrapeViaRapidApi(target.href);
    if (scraped) {
      return NextResponse.json(
        {
          ok: true,
          imageUrl: scraped.imageUrl,
          name: scraped.name,
          price: scraped.price,
          source: "shopee-api",
        },
        { status: 200 },
      );
    }
    // Fall through to Open Graph rather than failing outright.
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(target.href, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Shopee / TikTok serve bot-walled or empty HTML to unknown agents;
        // a real-browser UA maximises the chance of getting og:image meta.
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ms-MY,ms;q=0.9,en;q=0.8",
      },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { ok: false, code: "fetch_failed", status: upstream.status },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    // Allow missing content-type (some CDNs omit it) but reject obvious non-HTML.
    if (contentType && !/text\/html|application\/xhtml|application\/ld\+json/i.test(contentType)) {
      return NextResponse.json({ ok: false, code: "fetch_failed" }, { status: 502 });
    }

    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_HTML_BYTES) {
      return NextResponse.json({ ok: false, code: "fetch_failed" }, { status: 502 });
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    if (!html || html.length < 50) {
      return NextResponse.json({ ok: false, code: "no_image" }, { status: 422 });
    }

    const finalUrl = upstream.url || target.href;
    const extracted = extractProductFromHtml(html, finalUrl);

    if (!extracted.imageUrl) {
      return NextResponse.json({ ok: false, code: "no_image" }, { status: 422 });
    }

    return NextResponse.json(
      {
        ok: true,
        imageUrl: extracted.imageUrl,
        name: extracted.name,
        price: extracted.price,
        source: extracted.source,
      },
      { status: 200 },
    );
  } catch (error) {
    const aborted =
      error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    return NextResponse.json(
      { ok: false, code: aborted ? "fetch_timeout" : "fetch_failed" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}

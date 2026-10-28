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
  if (host.includes("shopee.com.my")) return "my";
  if (host.includes("shopee.sg")) return "sg";
  if (host.includes("shopee.")) return "my";
  return null;
}

/**
 * RapidAPI Shopee scraper (shopee-scraper1): GET /product?product={url}&country={my|id|sg}.
 * Response shape varies by vendor version, so image/name/price are picked
 * from every known field (`image`, `images`, `item_basic.image`,
 * `data.image`, ...). Returns null when nothing usable is found.
 */
async function scrapeViaRapidApi(
  productUrl: string,
  country: string,
): Promise<{ imageUrl: string; name: string | null; price: string | null } | null> {
  const key = process.env.RAPIDAPI_KEY ?? "";
  if (!key) return null;
  const host = process.env.RAPIDAPI_SHOPEE_HOST ?? "shopee-scraper1.p.rapidapi.com";

  let response: Response;
  try {
    const endpoint = `https://${host}/product?product=${encodeURIComponent(productUrl)}&country=${country}`;
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
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const candidates: unknown[] = [
    record.image,
    record.images,
    record.imageUrl,
    record.image_url,
    (record.item_basic as Record<string, unknown> | undefined)?.image,
    (record.data as Record<string, unknown> | undefined)?.image,
    (record.result as Record<string, unknown> | undefined)?.image,
    record.thumbnail,
  ];

  for (const candidate of candidates) {
    const url = firstImageUrl(candidate);
    if (url) {
      const name =
        (typeof record.name === "string" && record.name.trim()) ||
        (typeof record.title === "string" && record.title.trim()) ||
        null;
      const price =
        (typeof record.price === "string" && record.price.trim()) ||
        (typeof record.price === "number" ? String(record.price) : null) ||
        null;
      return { imageUrl: url, name: name?.slice(0, 200) ?? null, price: price?.slice(0, 32) ?? null };
    }
  }
  return null;
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
  const country = shopeeCountry(target.hostname);
  if (country) {
    const scraped = await scrapeViaRapidApi(target.href, country);
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

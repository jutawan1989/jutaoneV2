import { NextResponse, type NextRequest } from "next/server";
import { extractProductFromHtml } from "@/lib/scrape-product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;

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

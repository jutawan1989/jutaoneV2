/**
 * Shared product-image helpers (client + server safe, no Next.js import).
 *
 * Boss pasted a Shopee short link (s.shopee.com.my/...) and a local drag-drop
 * preview (blob:...) — neither loads on the public storefront. This module
 * centralises normalisation, direct-file detection and safety checks.
 */
const DIRECT_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"];
const DIRECT_HOSTS = [
  "images.unsplash.com",
  "plus.unsplash.com",
  "cdn.shopify.com",
  "res.cloudinary.com",
  "lh3.googleusercontent.com",
  "drive.google.com",
];
// Shopee / TikTok image CDNs serve direct files without an extension
// (e.g. https://down-my.img.susercontent.com/file/abc123), so scraped
// product images must be accepted by host even with no file extension.
// NOTE: page/short-link hosts (s.shopee.com.my, shopee.com.my, tiktok.com)
// are DELIBERATELY excluded — those are product pages, not image files,
// and accepting them reintroduces the broken-image bug Boss reported.
const DIRECT_CDN_SUFFIXES = [
  ".img.susercontent.com",
  "img.susercontent.com",
  ".shopeecdn.com",
  ".tiktokcdn.com",
  ".tiktokcdn-us.com",
  ".ibyteimg.com",
  ".tiktokv.com",
  ".pstatp.com",
  ".lazcdn.com",
  ".alicdn.com",
];
export function normalizeImageUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const drive = value.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (drive) return `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w1000`;
  const open = value.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (open && value.includes("drive.google.com/open")) {
    return `https://drive.google.com/thumbnail?id=${open[1]}&sz=w1000`;
  }
  return value;
}
export function isSafeImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
export function isDirectImageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(normalizeImageUrl(raw));
  } catch {
    return false;
  }
  const path = url.pathname.toLowerCase();
  if (DIRECT_EXT.some((ext) => path.endsWith(ext))) return true;
  if (DIRECT_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return true;
  const host = url.hostname.toLowerCase();
  if (DIRECT_CDN_SUFFIXES.some((suffix) => host === suffix.replace(/^\./, "") || host.endsWith(suffix))) return true;
  if (url.pathname.includes("/storage/v1/object/public/")) return true;
  return false;
}
/**
 * Submit-time validation for the merchant form.
 *
 * Returns the normalised URL to save, or a failure code the form turns into a
 * clear Malay error message. Kept beside the other helpers so the vitest suite
 * covers the exact rule the submit button enforces.
 */
export function validateImageForSubmit(
  raw: string,
): { ok: true; url: string | null } | { ok: false; code: "invalid_url" | "not_direct" } {
  if (!raw.trim()) return { ok: true, url: null };
  const url = normalizeImageUrl(raw);
  if (!isSafeImageUrl(url)) return { ok: false, code: "invalid_url" };
  if (/^(blob:|data:)/i.test(raw.trim())) return { ok: false, code: "invalid_url" };
  if (!isDirectImageUrl(url)) return { ok: false, code: "not_direct" };
  return { ok: true, url };
}

export function productInitials(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return "JO";
  const parts = clean.split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

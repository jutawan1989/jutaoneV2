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
  if (url.pathname.includes("/storage/v1/object/public/")) return true;
  return false;
}
export function productInitials(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return "JO";
  const parts = clean.split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

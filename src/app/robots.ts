import type { MetadataRoute } from "next";

/**
 * `/robots.txt` is excluded from the locale redirect in `middleware.ts`, so it
 * must be served from here; without this route the path would 404.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Analytics and payment endpoints have no crawlable content.
        disallow: ["/api/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

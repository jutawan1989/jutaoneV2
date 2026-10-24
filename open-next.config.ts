import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Cloudflare deploy config for the Next.js app.
 *
 * Note on hosting: the brief says Cloudflare Pages, but Pages requires every
 * dynamic route to run on the edge runtime, and our API routes need
 * `node:crypto` (visitor hashing, Chip signature verification). The supported
 * path is `@opennextjs/cloudflare`, which deploys to Cloudflare Workers with
 * static assets — the same network, the same free `*.workers.dev` URL, and
 * `nodejs_compat` gives us Node's crypto.
 */
export default defineCloudflareConfig();

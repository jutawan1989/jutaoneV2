# JutaOne.Biz — Phase 1 MVP

High-converting "moving billboard" landing page for small merchants in Malaysia
and Indonesia: type what you sell, get a localized TikTok/Facebook caption in
seconds, top up with tokens.

Commercial model: **token only** — RM3 or Rp10,000 = 1,000,000 tokens.

## Stack

| Layer     | Choice                                                  |
| --------- | ------------------------------------------------------- |
| Framework | Next.js 15 (App Router) + React 19 + TypeScript         |
| Styling   | Tailwind CSS v4                                         |
| Database  | Supabase (Singapore, `ap-southeast-1`)                  |
| AI        | Meta AI (Llama API, OpenAI-compatible) behind an adapter |
| Payments  | Chip.Asia (FPX / cards), sandbox-ready stub             |
| Hosting   | Cloudflare Pages                                         |

## Getting started

```bash
npm install
cp .env.example .env.local   # optional: the app runs fully on mocks
npm run dev
```

Open http://localhost:3000 — `/` redirects to a locale based on
`cf-ipcountry`. Locally there is no Cloudflare header, so set `FORCE_REGION=MY`
(or `ID`) to simulate a Malaysian or Indonesian visitor.

## Scripts

| Command             | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Dev server                                     |
| `npm run doctor`    | Probe every integration (GitHub, Supabase, Meta, Chip, Cloudflare) and report pass/fail |
| `npm run migrate`   | Apply `supabase/schema.sql` and verify tables, RLS, indexes |
| `npm run assets`    | Regenerate `public/assets/*.svg` from `lib/brand.ts` |
| `npm run build`     | Production build                               |
| `npm run lint`      | ESLint (Next config)                           |
| `npm run typecheck` | `tsc --noEmit`                                 |
| `npm test`          | Vitest unit suite (i18n, compliance, trial…)   |
| `npm start`         | Serve the production build                     |

QA helpers (need the dev/prod server running):

```bash
node scripts/qa-layout.mjs     # browser assertions: overflow, a11y, reduced motion
node scripts/qa-logo.mjs       # structural checks on the generated logo SVGs
node scripts/qa-perf.mjs       # LCP under Slow 4G + 4x CPU throttling
node scripts/screenshot.mjs    # writes PNG mockups to screenshots/
node scripts/render-logo.mjs   # writes logo previews to screenshots/
```

## Architecture

```
src/
  app/
    [locale]/layout.tsx      html lang, hreflang alternates, metadata
    [locale]/page.tsx        landing page (server-rendered per request)
    [locale]/topup/page.tsx  sandbox top-up screen
    api/demo                 caption generation + trial limit + kill switch
    api/events               analytics sink (Supabase)
    api/topup                creates a Chip.Asia purchase
    api/topup/callback       Chip.Asia webhook (signature verified)
    api/topup/simulate       sandbox-only success simulation
  components/                globe, navbar, hero, billboard, generator, widget…
  lib/
    ai/                      provider adapter: meta.ts, mock.ts, prompt, budget
    analytics/               events, UTM capture, A/B variant assignment
    i18n/                    locale config + en/ms/id dictionaries
    trial/                   visitor hashing, attempt store, limit rules
    payment/chip.ts          Chip.Asia client + signature verification
  middleware.ts              geo-routing + language cookie
supabase/schema.sql          tables, indexes, RLS, daily-cost function
tests/                       Vitest unit tests
```

### Locales and pricing

URLs are `/en`, `/ms`, `/id`; hreflang values are `ms-MY`, `id-ID`, `en` and
`x-default`. **Locale and currency are independent**: a visitor from Malaysia
reading the site in English still sees `RM3`, and an Indonesian visitor sees
`Rp10,000`. Region comes from `cf-ipcountry`, currency from `lib/pricing.ts`.

### Trial control (D3)

- Identity is a salted SHA-256 of the client IP **and** a server-side device
  fingerprint built from request headers, so clearing cookies or storage does
  not reset the count.
- Two attempts per visitor (`DEMO_MAX_ATTEMPTS`), plus a secondary cap per
  device fingerprint (`DEMO_DEVICE_MAX_ATTEMPTS`) that blocks "new IP, same
  browser" farming.
- Counted at acceptance, before generation, so repeated failures cannot be used
  to burn API credits.
- Without Supabase the app falls back to an in-memory store: fine for local dev,
  **not** valid on Cloudflare Pages, where isolates are recycled. Configure
  Supabase for real enforcement.

### Kill switch (D3)

`lib/ai/budget.ts` sums today's (UTC) `ai_usage.cost_usd` before every demo
call. At `DAILY_API_COST_LIMIT_USD` (default 50) the API returns `503` and the UI
switches to CTA-only. `KILL_SWITCH_FORCE=1` stops the demo immediately. Storage
errors fail open so a database blip cannot take the demo down for everyone.
Mock captions cost nothing, so the local template path never trips the switch.

### AI adapter (D1)

`lib/ai/index.ts` is the only place that knows about providers:

- `META_AI_API_KEY` set → Meta Llama API chat completions, 2.5s timeout.
- Key missing → deterministic local templates (localized, zero cost).
- Provider error/timeout → local template, so the visitor still gets a caption
  inside the 3 second budget.

### Conversion hook (D4)

Variant A sells on price, variant B on outcome. Assignment is a sticky 50/50
hash of the visitor key (no cookie needed). Outside production, `?variant=A|B`
overrides it for review.

### Analytics (D5)

Events: `demo_start`, `demo_success`, `demo_limit_reached`, `hook_view`,
`topup_click`, `topup_success`, plus `demo_blocked_killswitch`. Each row carries
locale, region, A/B variant, UTM params and a pseudonymous visitor hash — no PII.

### Globe (UI)

The brand mark is **JOB**, where the O is a globe. Geometry lives in
`src/lib/brand.ts`; the React component (`components/logo.tsx`) and the files in
`public/assets/` are both generated from it, and `tests/brand.test.ts` fails if
an asset is stale — run `npm run assets` after editing the mark.

Two variants: `logo-mark.svg` (bright gradient, for the dark UI) and
`logo-mark-light.svg` (deeper corporate blue, for white backgrounds). Lockups
add `JUTAONE.BIZ` plus the tagline.

The globe spins with a single CSS `rotate` transform inside the circular clip,
which is seamless and costs ~3.4KB of markup — no video, GIF or canvas.
`prefers-reduced-motion` stops it, verified by `scripts/qa-layout.mjs`.

## Supabase setup

1. Create the project in `ap-southeast-1` (Singapore). PDPA and UU PDP
   compliance require Singapore hosting; other regions are rejected by
   `npm run doctor`.
2. Put the management token and project ref in `.env.local`
   (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`).
3. Run `npm run migrate` — it applies `supabase/schema.sql` and verifies the
   tables, RLS, indexes and the daily-cost function.
4. Put the project URL and service role key in `.env.local` (`SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`). The service role key is server-only.

RLS is enabled on all tables with no policies: only the service role can read or
write.

Migrating to a new region is the same two steps against the new project — the
schema is idempotent.

## Chip.Asia

Without `CHIP_API_KEY`/`CHIP_BRAND_ID` the top-up button opens a sandbox screen
that records a simulated success. With keys present, `/api/topup` creates a real
purchase and redirects to Chip's hosted checkout; `/api/topup/callback` verifies
the RSA signature against `CHIP_PUBLIC_KEY` and rejects unsigned callbacks in
production.

## Deploying to Cloudflare

The brief says Cloudflare Pages, but Pages requires every dynamic route on the
edge runtime and our API routes need `node:crypto` for visitor hashing and RSA
signature checks. The supported path is `@opennextjs/cloudflare`, which deploys
to Cloudflare Workers with static assets — same network, free `*.workers.dev`
URL, and `nodejs_compat` provides Node's crypto. Say the word if you want Pages
specifically; it means replacing crypto with WebCrypto and re-verifying the Chip
signature checks.

```bash
# secrets (once per environment)
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put META_AI_API_KEY
npx wrangler secret put META_AI_BASE_URL
npx wrangler secret put META_AI_MODEL
npx wrangler secret put CHIP_API_KEY
npx wrangler secret put CHIP_BRAND_ID
npx wrangler secret put CHIP_PUBLIC_KEY
npx wrangler secret put CHIP_TEST_EMAIL
npx wrangler secret put VISITOR_HASH_SALT

npm run preview   # build + run in the local Workers runtime
npm run deploy    # build + deploy (staging only, see below)
```

`wrangler.jsonc` already sets `nodejs_compat` and the assets binding. For local
Workers preview, copy the runtime vars into `.dev.vars` (gitignored).

Staging only: **no production deploy without written approval from Linda and
Boss.**

## Compliance

- No PII is collected before top-up; the demo takes only the product text.
- All gold/silver copy is simulation-only, carries the approved disclaimer
  (`lib/compliance.ts`), and never promises returns. `tests/compliance.test.ts`
  fails the build if banned promise phrases appear in any locale.
- API keys live in `.env.local` only; `.env.example` holds placeholders.

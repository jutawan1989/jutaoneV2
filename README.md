# JutaOne.Biz — Phase 1 MVP

High-converting "moving billboard" landing page for small merchants in Malaysia
and Indonesia: type what you sell, get a localized TikTok/Facebook caption in
seconds, top up with tokens.

Commercial model: **token only** — USD 1 (≈ RM4.70 / ≈ Rp17,900) = 1,000,000 tokens.

## Stack

| Layer     | Choice                                                  |
| --------- | ------------------------------------------------------- |
| Framework | Next.js 15 (App Router) + React 19 + TypeScript         |
| Styling   | Tailwind CSS v4                                         |
| Database  | Supabase (Singapore, `ap-southeast-1`)                  |
| AI        | Provider chain: OpenRouter → Meta AI (Llama API) → local template |
| Payments  | Stripe (global cards, token top-up) + Chip.Asia (Store Rent only)             |
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
| `npm run build:worker` | Build the Worker with no secrets in the bundle, then scan for leaks |
| `npm run deploy`    | Safe build + scan, then deploy to Cloudflare Workers |
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
node scripts/qa-modal.mjs      # dialog semantics, focus trap, Escape, focus restore
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

`lib/ai/index.ts` is the only place that knows about providers. Providers are
tried in order and the first success wins:

1. **OpenRouter** (`openrouter.ts`) — once `OPENROUTER_API_KEY` is set. Tried
   first because Meta currently answers `402 billing_not_configured`.
2. **Meta** (`meta.ts`) — `muse-spark-1.3` (non-contributor tier), 3.5s timeout.
   The `-contributor` variants send prompts to training and must stay an
   explicit decision, not a default.
3. **Local template** (`mock.ts`) — deterministic, localized, zero cost. Used
   directly when no provider is configured, or as `mock-fallback` when every
   configured provider failed.

`OPENROUTER_ENABLED=0` drops back to the local template without removing the
key, which is the one-line rollback if the free model misbehaves.

**The free tier is fast only as a non-reasoning model.** The development-phase
model is `dots-studio/dots-3-note-preview:free`, requested with
`reasoning: { enabled: false }`. Measured against the production prompt, 4 runs
each:

| Model | Reasoning off | Result |
| ----- | ------------- | ------ |
| `dots-studio/dots-3-note-preview:free` | accepted | **1.6–1.9s**, 4/4, correct Malay/Indonesian/English, 3 hashtags |
| `nvidia/nemotron-3.5-lightning:free` | accepted | 1.0–6.0s (unstable), odd spelling, 4/4 |
| `recursive/flint-v1.0:free` | rejected | 9–14s; burns 946–1329 reasoning tokens, `content: null` below ~1500 `max_tokens` |
| `openrouter/free` | rejected | 6–12s, empty at 800 `max_tokens` |

The reasoning models ignore `reasoning.effort` and `reasoning.max_tokens`, so
capping output cannot make them fast — it only removes the caption. That is why
the free tier looked unusable before; disabling reasoning was the fix.

`OPENROUTER_REASONING=on` keeps a model's own default. A model that rejects the
flag ("Reasoning is mandatory for this endpoint") is retried once without it, so
swapping the model — e.g. to DeepSeek at launch — degrades to "slow" rather than
silently falling back to the local template.

Cost stays at zero in this phase: `usage.cost` is `0` on `:free` models, and
that is the value the kill switch records.

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

## Stripe (token top-up)

Token top-up is Stripe-only (ToyyibPay/Chip CLOSED for top-up). Without
`STRIPE_SECRET_KEY` the top-up button opens a sandbox screen that records a
simulated success. With the key present, `/api/topup` creates a real Checkout
Session (Test Mode while the key is `sk_test_...`: card 4242 4242 4242 4242,
no real charge) and redirects to Stripe's hosted checkout;
`/api/topup/stripe-callback` verifies the `Stripe-Signature` header against
`STRIPE_WEBHOOK_SECRET` and credits tokens only on
`checkout.session.completed` with `payment_status = "paid"`.

Chip.Asia remains wired for Store Rent only (`/api/subscription/checkout` +
`/api/topup/callback` rent branch) — not for token top-up.

## Building and deploying the Worker

**Never build with secrets present in `.env.local`.** OpenNext copies the whole
file into `.open-next/cloudflare/next-env.mjs`, which is bundled into the worker:
those values then live inside the deployed script, where they sit behind Worker
secrets as a runtime fallback. Rotating a key does not remove the old value from
the artefact.

Use the wrapper, which builds with only `NEXT_PUBLIC_*` vars and fails if any
secret reaches the bundle or the public assets:

```bash
npm run build:worker   # safe build + secret scan
npm run deploy         # safe build, scan, then deploy
```

Runtime secrets go in with `wrangler secret put` (or the dashboard field), never
through the build:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ADMIN_TEST_PASSWORD
npx wrangler secret put META_AI_API_KEY
npx wrangler secret put META_AI_BASE_URL
npx wrangler secret put META_AI_MODEL
npx wrangler secret put CHIP_API_KEY
npx wrangler secret put CHIP_BRAND_ID
npx wrangler secret put CHIP_PUBLIC_KEY
npx wrangler secret put CHIP_TEST_EMAIL
```

`wrangler.jsonc` sets `nodejs_compat` and the assets binding. Cloudflare Pages
was rejected: Pages requires every dynamic route on the edge runtime and these
API routes need `node:crypto` for visitor hashing and RSA signature checks.

### Staging deployment

`https://jutaonev2.jutawan1989.workers.dev`

Staging only: **no production deploy without written approval from Linda and
Boss.**

Staging runs against the Seoul project (`ap-northeast-2`), accepted by Boss for
staging only because Supabase cannot change a project's region. Data written
there is pseudonymous (salted SHA-256 hashes, locale, region, variant) — no IP
address, no device identifier, no PII — but **PDPA / UU PDP compliance still
requires Singapore before public launch**.

Verified on the live deployment with Supabase wired up:

- Attempts 1-2 return `200`, attempts 3-6 return `429 visitor_limit`.
- Events land in `events` with locale, region, variant and hooks.
- No row contains a raw IP or device value (all hashes are 64-char hex).
- The kill switch can now read real spend; it sat at `0` while Meta AI was
  returning 402 and captions came from the free local template.

`npm run doctor` prints `WARN` for both accepted staging exceptions and only
`PASS` when a check truly passes, so the output cannot be misread as compliant.

## Compliance

- No PII is collected before top-up; the demo takes only the product text.
- All gold/silver copy is simulation-only, carries the approved disclaimer
  (`lib/compliance.ts`), and never promises returns. `tests/compliance.test.ts`
  fails the build if banned promise phrases appear in any locale.
- API keys live in `.env.local` only; `.env.example` holds placeholders.

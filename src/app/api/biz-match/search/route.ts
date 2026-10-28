import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";
import { searchSuppliers, type SupplierResult } from "@/lib/search";
import { emptyMessage, isSearchCountry, type SearchCountry } from "@/lib/geo-domains";
import { SEARCH_COST_TOKENS, chargeTokens, getTokenBalance } from "@/lib/tokens";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/member";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_QUERY = 3;
const MAX_QUERY = 200;

/**
 * Supplier search for Biz-Match, metered.
 *
 * Money rule: charge 10,000 tokens only when the search actually succeeds.
 * The order is therefore:
 *
 *   1. check the balance and refuse early with 402 — cheaper than calling the
 *      live layers and then discovering the visitor cannot pay;
 *   2. call the live layers in order: Exa -> Tavily -> Serper (the primary
 *      leads; SEARCH_PROVIDER picks which one goes first);
 *   3. charge only if a live layer returned results;
 *   4. a failure, a zero-result search, or the directory fallback is free.
 *
 * The charge is keyed by a request reference, so a retried request does not
 * charge twice for one search.
 *
 * One caveat that matters: without a token grant flow, every visitor has a zero
 * balance and gets 402. `BIZ_MATCH_FREE=1` keeps the directory usable while
 * tokens are not yet issued; it exempts the search from the balance check but
 * still records nothing, so enabling it cannot silently cost money.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("q") ?? "";
  const query = raw.replace(/\s+/g, " ").trim();

  if (query.length < MIN_QUERY) {
    return NextResponse.json(
      { code: "query_too_short", min: MIN_QUERY, results: [], source: "none" },
      { status: 400 },
    );
  }
  if (query.length > MAX_QUERY) {
    return NextResponse.json(
      { code: "query_too_long", max: MAX_QUERY, results: [], source: "none" },
      { status: 400 },
    );
  }

  // Country scope. Explicit `?country=` wins; otherwise fall back to the
  // Cloudflare geo header, which the site already relies on elsewhere. Never
  // guess: an unscoped search is exactly the bug Boss reported.
  const requestedCountry = request.nextUrl.searchParams.get("country")?.toUpperCase() ?? null;
  const headerCountry = request.headers.get("cf-ipcountry")?.toUpperCase() ?? null;
  const country: SearchCountry = isSearchCountry(requestedCountry)
    ? requestedCountry
    : isSearchCountry(headerCountry)
      ? headerCountry
      : "MY";

  const visitor = identifyVisitor(request.headers);
  const freeMode = process.env.BIZ_MATCH_FREE === "1";

  // Members pay from their ledger identity (owner_ref from the signed
  // session cookie) — the same identity the dashboard sums for the balance
  // display. Anonymous visitors keep the header-derived visitor key (their
  // only identity). Reading the wrong one is exactly the bug Boss hit:
  // dashboard showed 2.26M tokens while search read an empty visitor key.
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionOwner = verifySession(readSessionCookie(cookieHeader));
  const ledgerKey = sessionOwner ?? visitor.visitorKey;

  // A retried request reuses the same reference, so it cannot double-charge.
  const reference =
    request.nextUrl.searchParams.get("rid")?.slice(0, 64) ??
    `search:${ledgerKey.slice(0, 16)}:${Buffer.from(query).toString("base64url").slice(0, 24)}`;

  const balance = await getTokenBalance(ledgerKey);

  // Step 1: refuse before spending a live-layer request.
  if (!freeMode && balance < SEARCH_COST_TOKENS) {
    return NextResponse.json(
      {
        code: "insufficient_tokens",
        required: SEARCH_COST_TOKENS,
        balance,
        rationale: "Carian ini memerlukan 10,000 token.",
        results: [],
        source: "none",
      },
      { status: 402 },
    );
  }

  // Live layers in order (Exa -> Tavily -> Serper). Which provider leads
  // is configuration (SEARCH_PROVIDER), not code.
  const { outcome, attempts } = await searchSuppliers(query, country);
  const providerErrors = attempts
    .filter((attempt) => !attempt.ok)
    .map((attempt) => `${attempt.provider}: ${attempt.error}`)
    .join(" | ");

  {
    {
      const results = outcome.results;
      if (results.length > 0) {
        // Step 3: real results, so this one is billable.
        const charge = freeMode
          ? ({ ok: true, charged: false, balanceAfter: balance, replayed: false } as const)
          : await chargeTokens({
              visitorKey: ledgerKey,
              cost: SEARCH_COST_TOKENS,
              reference,
              note: `biz-match:${query.slice(0, 80)}`,
            });

        if (!charge.ok && charge.reason === "insufficient") {
          // Lost the race against a concurrent charge: no results, no fee.
          return NextResponse.json(
            {
              code: "insufficient_tokens",
              required: SEARCH_COST_TOKENS,
              balance,
              results: [],
              source: "none",
            },
            { status: 402 },
          );
        }

        return NextResponse.json({
          ok: true,
          source: outcome.provider,
          country,
          count: results.length,
          providerErrors: providerErrors || null,
          results,
          // The UI shows exactly what was charged, and why nothing was.
          billing: {
            chargedTokens: charge.ok && charge.charged ? SEARCH_COST_TOKENS : 0,
            balanceAfter: charge.ok ? charge.balanceAfter : balance,
            replayed: charge.ok ? charge.replayed : false,
            freeMode,
          },
        });
      }
    }
  }

  const degraded = providerErrors || "no_results_for_country";
  if (providerErrors) {
    console.error("[jutaone] search providers failed, falling back to directory", providerErrors);
  }

  // Step 4: nothing usable came back, so the visitor is not charged.
  const results = await searchDirectory(query);

  return NextResponse.json({
    ok: true,
    source: "directory",
    country,
    count: results.length,
    degraded,
    // Country-scoped emptiness gets its own copy, and the other country is
    // never substituted: showing Malaysian suppliers to an Indonesian buyer is
    // the bug this feature exists to fix.
    message: results.length === 0 ? emptyMessage(country) : null,
    results,
    billing: {
      chargeAfterSuccess: true,
      chargedTokens: 0,
      balanceAfter: balance,
      freeMode,
    },
  });
}

/** Reads the signed member session cookie value from a Cookie header. */
function readSessionCookie(header: string): string | undefined {
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** Local fallback over the seeded/imported supplier table. */
async function searchDirectory(query: string): Promise<SupplierResult[]> {
  const db = getSupabase();
  if (!db) return [];

  const { data, error } = await db.rpc("jutaone_search_suppliers", {
    p_query: query,
    p_category: null,
    p_country: null,
    p_limit: 20,
  });

  if (error) {
    console.error("[jutaone] directory fallback failed", error.message);
    return [];
  }

  type Row = {
    id: number;
    company_name: string;
    category: string | null;
    location: string | null;
    country: string;
    website: string | null;
    verified: boolean;
  };

  return ((data ?? []) as Row[]).map((row) => ({
    id: `dir-${row.id}`,
    companyName: row.company_name,
    category: row.category,
    location: row.location,
    country: row.country,
    description: null,
    url: row.website,
    origin: "directory" as const,
    verified: row.verified,
  }));
}

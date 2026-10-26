import { headers } from "next/headers";
import { AffiliateNetwork } from "@/components/affiliate-network";
import { getAffiliateSummary, getAffiliateSummaryByCode, isValidReferralCode } from "@/lib/affiliate";
import { identifyVisitor } from "@/lib/trial/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Rangkaian afiliasi — JutaOne.Biz",
  robots: { index: false, follow: false },
};

/**
 * Affiliate network dashboard: a 19-level table plus passive income.
 *
 * Two ways in:
 *   - `?ref=CODE` — explicit lookup. Stable and shareable, and the only way to
 *     reach a network from a different device. Until Phase 2 adds real auth the
 *     code is a bearer secret, so the page is noindex and shows only aggregate
 *     counts and earned amounts.
 *   - no parameter — falls back to the header-derived visitor hash, which is
 *     convenient but fragile: a browser changing its client hints changes the
 *     hash and the merchant loses their own view.
 *
 * Rendered on the server so the tree is complete in the first paint; a table
 * that fills in after hydration looks broken on a slow connection.
 */
export default async function AffiliateDashboard({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const requested = typeof ref === "string" ? ref.trim().toLowerCase() : "";

  let summary = null;
  let invalidCode = false;

  if (requested) {
    if (!isValidReferralCode(requested)) {
      invalidCode = true;
    } else {
      summary = await getAffiliateSummaryByCode(requested);
      // A well-formed code that matches nothing is still "not found" rather than
      // "invalid"; the UI distinguishes the two so a typo is obvious.
      invalidCode = summary === null;
    }
  } else {
    const owner = identifyVisitor(await headers()).visitorKey;
    summary = await getAffiliateSummary(owner);
  }

  return (
    <AffiliateNetwork
      summary={summary}
      requestedCode={requested || null}
      invalidCode={invalidCode}
    />
  );
}

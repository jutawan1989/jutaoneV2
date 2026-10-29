import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MemberDashboard } from "@/components/member-dashboard";
import { SESSION_COOKIE, getMemberProfile, verifySession } from "@/lib/auth/member";
import { loadMemberOverview, loadMemberPayouts } from "@/lib/member-data";
import { ensureAffiliateCode, getAffiliateSummary, percentFor } from "@/lib/affiliate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard — JutaOne.Biz",
  robots: { index: false, follow: false },
};

/**
 * Members area: overview, store, affiliate network and AI tools.
 *
 * Server-rendered behind a signed session cookie. Everything is loaded in one
 * pass so the four tabs do not each trigger a waterfall on open.
 */
export default async function DashboardPage() {
  const jar = await cookies();
  const ownerRef = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!ownerRef) redirect("/login?next=/dashboard");

  const [overview, payouts, profile, network] = await Promise.all([
    loadMemberOverview(ownerRef),
    loadMemberPayouts(ownerRef),
    getMemberProfile(ownerRef),
    getAffiliateSummary(ownerRef),
  ]);

  // Auto-mint so "Pautan Rujukan" is never empty: a member who registered
  // before auto-codes (or whose row somehow vanished) gets their code the
  // first time they open the dashboard, linked flat (no referrer known here).
  let overviewCode = overview.affiliate.code;
  if (!overviewCode) {
    overviewCode = await ensureAffiliateCode(ownerRef);
    if (overviewCode) overview.affiliate.code = overviewCode;
  }

  // The referral commission summary is already modelled by `getAffiliateSummary`. It is
  // passed through untouched so the dashboard can draw the same table the
  // dedicated network page shows — no second source of truth for the rates.
  const levels =
    network?.levels ??
    Array.from({ length: 19 }, (_, index) => ({
      level: index + 1,
      people: 0,
      earnedMinor: 0,
      percent: percentFor(index + 1),
    }));

  // The greeting needs a name. Falling back to the email local-part is better
  // than "Selamat kembali, undefined" and needs no extra signup field.
  const name = profile?.displayName?.trim() || profile?.email?.split("@")[0] || "rakan";

  // Dual-Tone (Boss spec): kandungan dashboard cerah — latar slate-100,
  // kad putih bersih dengan border nipis. Sidebar kekal navy gelap.
  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900">
      <MemberDashboard overview={overview} payouts={payouts} name={name} levels={levels} />
    </div>
  );
}

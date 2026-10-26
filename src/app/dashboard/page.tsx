import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MemberDashboard } from "@/components/member-dashboard";
import { SESSION_COOKIE, getMemberProfile, verifySession } from "@/lib/auth/member";
import { loadMemberOverview, loadMemberPayouts } from "@/lib/member-data";

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

  const [overview, payouts, profile] = await Promise.all([
    loadMemberOverview(ownerRef),
    loadMemberPayouts(ownerRef),
    getMemberProfile(ownerRef),
  ]);

  // The greeting needs a name. Falling back to the email local-part is better
  // than "Selamat kembali, undefined" and needs no extra signup field.
  const name = profile?.displayName?.trim() || profile?.email?.split("@")[0] || "rakan";

  return <MemberDashboard overview={overview} payouts={payouts} name={name} />;
}

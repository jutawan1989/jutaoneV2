import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/admin-panel";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin/auth";
import { loadAdminMembers, loadAdminStats, loadPayoutQueue } from "@/lib/admin/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin — JutaOne.Biz",
  robots: { index: false, follow: false },
};

/**
 * Boss dashboard.
 *
 * Reuses the existing `/admin/login` password gate (`ADMIN_TEST_PASSWORD`) rather
 * than adding a second, weaker door: that session is already signed, httpOnly and
 * throttled, and it is the only admin credential the deployment has.
 */
export default async function AdminPage() {
  const jar = await cookies();
  if (!verifySession(jar.get(ADMIN_COOKIE)?.value)) redirect("/admin/login");

  const [stats, members, payouts] = await Promise.all([
    loadAdminStats(),
    loadAdminMembers(),
    loadPayoutQueue(),
  ]);

  return <AdminPanel stats={stats} members={members} payouts={payouts} />;
}

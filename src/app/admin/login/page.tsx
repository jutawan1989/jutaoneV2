import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-login-form";
import { ADMIN_COOKIE, adminMisconfiguredReason, verifySession } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin — JutaOne.Biz",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const misconfigured = adminMisconfiguredReason();
  if (misconfigured) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
        <div className="card p-6">
          <h1 className="text-lg font-semibold text-white">Admin panel disabled</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">{misconfigured}</p>
        </div>
      </main>
    );
  }

  const jar = await cookies();
  if (verifySession(jar.get(ADMIN_COOKIE)?.value)) redirect("/admin");

  return <AdminLoginForm />;
}

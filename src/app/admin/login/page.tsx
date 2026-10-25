import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-login-form";
import {
  ADMIN_COOKIE,
  adminMisconfiguredReason,
  verifySession,
} from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Sign in — internal",
};

export default async function AdminLoginPage() {
  if (adminMisconfiguredReason()) {
    // Nothing to sign into; the playground page explains why.
    redirect("/admin/playground");
  }

  const jar = await cookies();
  if (verifySession(jar.get(ADMIN_COOKIE)?.value)) {
    redirect("/admin/playground");
  }

  return <AdminLoginForm />;
}

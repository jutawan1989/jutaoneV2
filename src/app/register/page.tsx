import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MemberRegisterForm } from "@/components/member-register-form";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Daftar — JutaOne.Biz",
  robots: { index: false, follow: false },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; ref?: string }>;
}) {
  const jar = await cookies();
  if (verifySession(jar.get(SESSION_COOKIE)?.value)) redirect("/dashboard");

  const { next, ref } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") ? next : "/dashboard";
  const referredBy =
    typeof ref === "string" && /^[a-z0-9][a-z0-9_-]{2,31}$/i.test(ref.trim())
      ? ref.trim().toLowerCase()
      : null;
  return <MemberRegisterForm next={target} referredBy={referredBy} />;
}

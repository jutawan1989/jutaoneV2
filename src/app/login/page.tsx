import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MemberLoginForm } from "@/components/member-login-form";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Log masuk — JutaOne.Biz",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const jar = await cookies();
  if (verifySession(jar.get(SESSION_COOKIE)?.value)) redirect("/dashboard");

  const { next } = await searchParams;
  return <MemberLoginForm next={typeof next === "string" ? next : "/dashboard"} />;
}

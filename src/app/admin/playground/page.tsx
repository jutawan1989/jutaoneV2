import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PlaygroundClient } from "@/components/playground-client";
import {
  ADMIN_COOKIE,
  adminMisconfiguredReason,
  verifySession,
} from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Never indexed, never linked from the public site.
export const metadata = {
  robots: { index: false, follow: false },
  title: "Playground — internal",
};

export default async function PlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const misconfigured = adminMisconfiguredReason();
  if (misconfigured) {
    // Fail closed: an unconfigured or weak password disables the page entirely
    // rather than opening an unlimited API-burning route.
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
        <div className="card p-6">
          <h1 className="text-lg font-semibold text-white">Playground disabled</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">{misconfigured}</p>
          <p className="mt-3 text-xs leading-relaxed text-muted/80">
            Set a strong <code className="text-silver">ADMIN_TEST_PASSWORD</code> (12+
            characters) in the Worker secrets, then reload.
          </p>
        </div>
      </main>
    );
  }

  const jar = await cookies();
  const session = jar.get(ADMIN_COOKIE)?.value;
  if (!verifySession(session)) {
    redirect("/admin/login");
  }

  const { error } = await searchParams;

  return (
    <PlaygroundClient
      errorText={error === "invalid" ? "Incorrect password." : null}
    />
  );
}

"use client";

import { useEffect } from "react";

/**
 * Dashboard-scoped error boundary.
 *
 * The members area reads four Supabase sources in one pass (tokens, store,
 * payouts, affiliate network). Any render crash here used to surface as
 * "Application error: a client-side exception" with no recovery. This
 * boundary shows a retry state instead so the member can recover without
 * losing the session.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[jutaone] dashboard render failed", error.message.slice(0, 200));
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16 text-center sm:px-6">
      <p className="text-sm font-semibold text-slate-900">Dashboard gagal dimuatkan</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Sesuatu gagal dipaparkan. Cuba lagi — data anda selamat.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="min-h-[44px] rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Cuba lagi
        </button>
        <button
          type="button"
          onClick={() => {
            fetch("/api/auth", { method: "DELETE" }).finally(() => {
              window.location.href = "/login?next=/dashboard";
            });
          }}
          className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600"
        >
          Log masuk semula
        </button>
      </div>
    </div>
  );
}

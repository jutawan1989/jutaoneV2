"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { whatsappShortFor, whatsappUrl } from "@/lib/contact";
import type { Locale } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n";
import type { Variant } from "@/lib/analytics/variant";

type TopUpPanelProps = {
  locale: Locale;
  variant: Variant;
  dict: Dictionary;
  priceDisplay: string;
  priceLocal: string | null;
  tokensDisplay: string;
  tokenName: string;
  reference: string | null;
  status: string | null;
  showSimulator: boolean;
};

type VerifyState = "idle" | "checking" | "processing" | "done" | "error";

const MAX_POLLS = 8;
const POLL_MS = 4000;

/**
 * Top-up return screen. NEVER trusts `?status=success` on its own — that
 * query param is set by the gateway return URL, which fires before the
 * server webhook credits anything. Every success claim is verified against
 * `/api/topup/status` (real `topups` row with `status = 'paid'`). While the
 * webhook is still in flight the user sees "processing", never a fake
 * token balance.
 */
export function TopUpPanel({
  locale,
  variant,
  dict,
  priceDisplay,
  priceLocal,
  tokensDisplay,
  tokenName,
  reference,
  status,
  showSimulator,
}: TopUpPanelProps) {
  const [ref, setRef] = useState<string | null>(reference);
  const [state, setState] = useState<VerifyState>(
    status === "success" ? (reference ? "checking" : "processing") : "idle",
  );
  const [busy, setBusy] = useState(false);
  const [creditedTokens, setCreditedTokens] = useState(0);
  const [simError, setSimError] = useState(false);
  // Bumps to (re)start the verify loop. True on mount for gateway returns.
  const [verifying, setVerifying] = useState(status === "success" && Boolean(reference));

  const verify = useCallback(
    async (currentRef: string): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/topup/status?ref=${encodeURIComponent(currentRef)}`,
          { cache: "no-store" },
        );
        const data = (await response.json().catch(() => null)) as {
          ok?: boolean;
          paid?: boolean;
          tokens?: number;
        } | null;
        if (response.ok && data?.ok && data.paid) {
          setCreditedTokens(Number(data.tokens ?? 0));
          setState("done");
          setVerifying(false);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [],
  );

  // Verify the gateway return, then keep polling while the webhook may
  // still be in flight. Stops after MAX_POLLS — the user stays on an
  // honest "processing" message with a manual re-check button.
  useEffect(() => {
    if (!verifying || !ref) return;
    let cancelled = false;

    (async () => {
      for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
        if (cancelled) return;
        if (attempt > 0) {
          setState("processing");
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
          if (cancelled) return;
        }
        const paid = await verify(ref);
        if (cancelled) return;
        if (paid) return;
      }
      setState("processing");
      setVerifying(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [verifying, ref, verify]);

  async function recheck() {
    if (!ref || verifying) return;
    setState("checking");
    setVerifying(true);
  }

  async function simulatePayment() {
    if (busy) return;
    setBusy(true);
    setSimError(false);
    try {
      const response = await fetch("/api/topup/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, variant, reference: ref }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        reference?: string;
      } | null;
      if (response.ok && data?.ok) {
        if (typeof data.reference === "string" && data.reference) setRef(data.reference);
        setState("checking");
        setVerifying(true);
      } else {
        setSimError(true);
      }
    } catch {
      setSimError(true);
    } finally {
      setBusy(false);
    }
  }

  const statusLine =
    state === "done"
      ? creditedTokens > 0
        ? format(dict.topup.statusPaid, { tokens: creditedTokens.toLocaleString("en-US") })
        : format(dict.topup.finished, { tokenName })
      : state === "checking"
        ? dict.topup.statusChecking
        : state === "processing"
          ? dict.topup.statusProcessing
          : dict.topup.statusMock;

  return (
    <div className="card mx-auto w-full max-w-lg p-6 sm:p-8">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-white sm:text-2xl">
        {dict.topup.title}
      </h1>
      <p className="mt-2 text-sm text-muted">{dict.topup.subtitle}</p>

      <dl className="mt-7 space-y-3 text-sm">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <dt className="text-muted">{dict.topup.amount}</dt>
          <dd className="text-right">
            <span className="font-semibold text-white tabular-nums">{priceDisplay}</span>
            {priceLocal && (
              <span className="mt-0.5 block text-[11px] text-muted tabular-nums">{priceLocal}</span>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between border-b border-line pb-3">
          <dt className="text-muted">{dict.topup.tokens}</dt>
          <dd className="font-medium text-silver">{tokensDisplay}</dd>
        </div>
        <div className="flex items-center justify-between border-b border-line pb-3">
          <dt className="text-muted">{dict.topup.status}</dt>
          <dd className="text-right text-silver" aria-live="polite">
            {statusLine}
          </dd>
        </div>
        {ref && (
          <div className="flex items-center justify-between">
            <dt className="text-muted">ref</dt>
            <dd className="font-mono text-xs text-muted">{ref}</dd>
          </div>
        )}
      </dl>

      {state === "processing" && ref && (
        <button
          type="button"
          onClick={recheck}
          className="btn-brand mt-6 w-full"
        >
          {dict.topup.recheck}
        </button>
      )}

      {showSimulator && (state === "idle" || state === "error") && (
        <button
          type="button"
          onClick={simulatePayment}
          disabled={busy}
          className="btn-brand mt-6 w-full"
        >
          {dict.topup.finish}
        </button>
      )}

      {(state === "error" || simError) && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {dict.generator.errorGeneric}
        </p>
      )}

      {state === "processing" && (
        <Link
          href="/dashboard"
          className="mt-4 block text-center text-sm font-medium text-muted transition-colors hover:text-white"
        >
          {dict.topup.viewDashboard}
        </Link>
      )}

      <a
        href={`/${locale}#demo`}
        className="mt-4 block text-center text-sm font-medium text-muted transition-colors hover:text-white"
      >
        {dict.topup.back}
      </a>

      <p className="mt-3 text-center text-xs leading-relaxed text-muted">
        {dict.topup.whatsappNote}{" "}
        <a
          href={whatsappUrl(dict.contact.prefill, locale)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-emerald-400 underline-offset-2 hover:underline"
        >
          {dict.contact.linkLabel} {whatsappShortFor(locale)}
        </a>
      </p>
    </div>
  );
}

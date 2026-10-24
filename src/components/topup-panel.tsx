"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n";
import type { Variant } from "@/lib/analytics/variant";

type TopUpPanelProps = {
  locale: Locale;
  variant: Variant;
  dict: Dictionary;
  priceDisplay: string;
  tokenName: string;
  reference: string | null;
  status: string | null;
  showSimulator: boolean;
};

/**
 * Sandbox top-up screen. When Chip.Asia credentials are configured the visitor
 * is sent to Chip's hosted checkout instead of landing here.
 */
export function TopUpPanel({
  locale,
  variant,
  dict,
  priceDisplay,
  tokenName,
  reference,
  status,
  showSimulator,
}: TopUpPanelProps) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
    status === "success" ? "done" : "idle",
  );

  async function simulatePayment() {
    setState("busy");
    try {
      const response = await fetch("/api/topup/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, variant, reference }),
      });
      setState(response.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="card mx-auto w-full max-w-lg p-6">
      <h1 className="text-2xl font-extrabold text-white">{dict.topup.title}</h1>
      <p className="mt-2 text-sm text-muted">{dict.topup.subtitle}</p>

      <dl className="mt-6 space-y-3 text-sm">
        <div className="flex items-center justify-between border-b border-line/70 pb-3">
          <dt className="text-muted">{dict.topup.amount}</dt>
          <dd className="font-bold text-white">{priceDisplay}</dd>
        </div>
        <div className="flex items-center justify-between border-b border-line/70 pb-3">
          <dt className="text-muted">{dict.topup.tokens}</dt>
          <dd className="font-semibold text-brand">{tokenName}</dd>
        </div>
        <div className="flex items-center justify-between border-b border-line/70 pb-3">
          <dt className="text-muted">{dict.topup.status}</dt>
          <dd className="text-right text-silver">
            {state === "done" ? format(dict.topup.finished, { tokenName }) : dict.topup.statusMock}
          </dd>
        </div>
        {reference && (
          <div className="flex items-center justify-between">
            <dt className="text-muted">ref</dt>
            <dd className="font-mono text-xs text-muted">{reference}</dd>
          </div>
        )}
      </dl>

      {showSimulator && state !== "done" && (
        <button
          type="button"
          onClick={simulatePayment}
          disabled={state === "busy"}
          className="btn-brand mt-6 w-full"
        >
          {dict.topup.finish}
        </button>
      )}

      {state === "error" && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {dict.generator.errorGeneric}
        </p>
      )}

      <a
        href={`/${locale}#demo`}
        className="mt-4 block text-center text-sm font-medium text-muted transition-colors hover:text-white"
      >
        {dict.topup.back}
      </a>
    </div>
  );
}

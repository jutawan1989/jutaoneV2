"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The "open your store" premium modal.
 *
 * Two paths, deliberately unequal: the free trial is the primary action because
 * it is what converts a curious merchant, and paying is the secondary. The price
 * is shown in USD with the local approximation beneath it, matching how tokens
 * are priced, so the two products read consistently.
 */
export function StoreSubscriptionModal({
  open,
  onClose,
  onTrialStarted,
}: {
  open: boolean;
  onClose: () => void;
  onTrialStarted: (trialEndsAt: string) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"trial" | "pay" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function focusable(): HTMLElement[] {
      const root = dialogRef.current;
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = Boolean(dialogRef.current?.contains(active));
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  async function startTrial() {
    setBusy("trial");
    setError(null);
    try {
      const response = await fetch("/api/subscription/trial", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setError(
          data.code === "already_subscribed"
            ? "Anda sudah mempunyai langganan. Sila log masuk semula."
            : "Tidak berjaya memulakan percubaan. Sila cuba lagi.",
        );
        return;
      }
      onTrialStarted(data.trialEndsAt);
    } catch {
      setError("Rangkaian bermasalah. Sila cuba lagi.");
    } finally {
      setBusy(null);
    }
  }

  async function subscribeNow() {
    setBusy("pay");
    setError(null);
    try {
      const response = await fetch("/api/subscription/checkout", { method: "POST" });
      const data = await response.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setError(
        data.code === "chip_unavailable"
          ? "Pembayaran belum tersedia. Cuba percubaan percuma dahulu."
          : "Tidak berjaya membuka pembayaran.",
      );
    } catch {
      setError("Rangkaian bermasalah. Sila cuba lagi.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sub-title"
        className="modal-enter card relative w-full max-w-md p-6 sm:p-7"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="absolute top-4 right-4 rounded-md border border-line px-2 py-0.5 text-xs text-muted transition-colors hover:border-[#334155] hover:text-white"
        >
          ✕
        </button>

        <p className="text-[11px] font-medium tracking-[0.12em] text-brand uppercase">
          Kedai Pro
        </p>
        <h2
          id="sub-title"
          className="mt-2.5 pr-8 text-xl font-semibold tracking-[-0.02em] text-white"
        >
          Aktifkan Kedai Anda
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-muted">
          Dapatkan <span className="font-medium text-white">7 hari percubaan percuma</span>.
          Seterusnya hanya{" "}
          <span className="font-medium text-white">$5.00/bulan</span>{" "}
          <span className="text-silver">(≈ RM23.50 / Rp80,000)</span>.
        </p>

        <ul className="mt-4 space-y-2 border-y border-line py-4 text-sm text-silver">
          {[
            "Kedai awam dengan badge Verified",
            "Pesanan bertulis + invois PDF",
            "Produk tanpa had",
            "Batal bila-bila masa",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <span aria-hidden className="mt-0.5 text-xs font-semibold text-brand">
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={startTrial}
          disabled={busy !== null}
          className="btn-brand mt-5 w-full"
        >
          {busy === "trial" ? "Mengaktifkan…" : "Mula Percubaan Percuma"}
        </button>

        <button
          type="button"
          onClick={subscribeNow}
          disabled={busy !== null}
          className="btn-ghost mt-2.5 w-full"
        >
          {busy === "pay" ? "Membuka pembayaran…" : "Langgan Sekarang — $5.00/bulan"}
        </button>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted/80">
          Tiada kontrak. Boleh batal bila-bila masa. Bayaran diproses oleh Chip.Asia.
        </p>
      </div>
    </div>
  );
}

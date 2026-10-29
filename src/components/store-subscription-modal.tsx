"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The "open your store" premium modal.
 *
 * Two paths, deliberately unequal: the free trial is the primary action because
 * it is what converts a curious merchant, and paying is the secondary. The price
 * is shown in USD with the local approximation beneath it, matching how tokens
 * are priced, so the two products read consistently.
 *
 * Stability notes (Boss Task 4 — the "Aktifkan Kedai" glitch):
 *   - Rendered with `createPortal` into `document.body`, never inline. The
 *     merchant dashboard lives under a `<main>` with a page-in animation; a
 *     transformed/filtered ancestor turns `position: fixed` into
 *     position-relative-to-that-ancestor, which is what made the overlay jump
 *     and misplace on open.
 *   - The focus trap measures visibility with `getClientRects()`, not
 *     `offsetParent` (which is `null` for fixed-position elements, collapsing
 *     the trap to zero items and letting Tab escape the dialog).
 *   - Mount state is explicit: the component stays mounted while closed and
 *     only portals the overlay when `open`, so rapid open/close clicks cannot
 *     strand a half-removed overlay or a locked `body` scroll.
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
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState<"trial" | "pay" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    // The dialog portals in on the same frame — focus on the next frame so
    // the node is in the DOM when focus lands.
    const frame = requestAnimationFrame(() => closeRef.current?.focus());

    function focusable(): HTMLElement[] {
      const root = dialogRef.current;
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.getClientRects().length > 0 || el === document.activeElement);
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
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

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

  return createPortal(
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
          Aktifkan Kedai Anda Hari Ini. Dapatkan{" "}
          <span className="font-medium text-white">7 Hari Percubaan Percuma</span>. Selepas itu,
          hanya <span className="font-medium text-white">$5.00/bulan</span>{" "}
          <span className="text-silver">(≈ RM23.50)</span>.
        </p>

        <div className="mt-4 rounded-lg border border-line bg-ink/50 p-3.5">
          <p className="text-[11px] font-medium tracking-[0.1em] text-muted uppercase">
            Bandingkan
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-silver">
            Shopify caj <span className="font-medium text-white">RM136/bulan</span> untuk kedai
            sahaja. JutaOne.Biz beri anda Kedai + AI Marketing + Pembekal hanya dengan{" "}
            <span className="font-medium text-white">RM23.50</span>.
          </p>
        </div>

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
          {busy === "trial" ? "Mengaktifkan…" : "Start 7-Day Free Trial"}
        </button>

        <button
          type="button"
          onClick={subscribeNow}
          disabled={busy !== null}
          className="btn-ghost mt-2.5 w-full"
        >
          {busy === "pay" ? "Membuka pembayaran…" : "Subscribe Now ($5)"}
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
    </div>,
    document.body,
  );
}

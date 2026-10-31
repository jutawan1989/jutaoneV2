"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
/** CTO spec, mirrored from `STORE_RENT_TOKENS` in `lib/rent.ts` (server-only module). */
const STORE_RENT_TOKENS = 5_000_000;
const STORE_RENT_DAYS = 30;

/**
 * The "open your store" premium modal — token-only (CTO spec).
 *
 * ONE path: 5,000,000 Token = 30 hari via POST /api/store/activate.
 * Trial/checkout/Stripe/Chip paths are CLOSED (TASK 1).
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
  onRentActivated,
}: {
  open: boolean;
  onClose: () => void;
  onRentActivated: (paidUntil: string) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState<"rent" | null>(null);
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

  async function activateWithTokens() {
    if (busy) return;
    setBusy("rent");
    setError(null);
    try {
      const response = await fetch("/api/store/activate", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok) {
        onRentActivated(data.paidUntil);
        return;
      }
      setError(
        response.status === 402 || data?.code === "insufficient_tokens"
          ? "Baki tidak cukup. Sila Top-Up Token."
          : data?.code === "login_required"
            ? "Sila log masuk dahulu."
            : "Tidak berjaya mengaktifkan kedai. Sila cuba lagi.",
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
          className="absolute top-4 right-4 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-line text-xs text-muted transition-colors hover:border-[#334155] hover:text-white"
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
          Sewa Kedai: <span className="font-medium text-white">{STORE_RENT_TOKENS.toLocaleString("en-US")} Token ({STORE_RENT_DAYS} hari)</span>.
        </p>

        <div className="mt-4 rounded-lg border border-line bg-ink/50 p-3.5">
          <p className="mt-1.5 text-xs leading-relaxed text-silver">
            Ditolak daripada baki Token anda. Baki tidak cukup? Top-up melalui Curlec (FPX / kad).
          </p>
        </div>

        <ul className="mt-4 space-y-2 border-y border-line py-4 text-sm text-silver">
          {[
            "Kedai awam dibuka 30 hari",
            "Pesanan bertulis + invois PDF",
            "Produk tanpa had",
            "Boleh panjangkan bila-bila masa",
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
          onClick={activateWithTokens}
          disabled={busy !== null}
          className="btn-brand mt-5 w-full"
        >
          {busy ? "Mengaktifkan…" : `Aktifkan Kedai (Tolak ${STORE_RENT_TOKENS.toLocaleString("en-US")} Token)`}
        </button>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted/80">
          Tiada kontrak. Sewa dibayar dengan Token, bukan kad.
        </p>
      </div>
    </div>,
    document.body,
  );
}

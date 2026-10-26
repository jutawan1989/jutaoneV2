"use client";

/**
 * The browser's own print dialog produces a selectable, searchable PDF, so no
 * PDF library is shipped for a page printed once per order.
 */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-brand px-3.5 py-2 text-sm">
      Muat turun PDF
    </button>
  );
}

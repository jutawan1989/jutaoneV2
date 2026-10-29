/**
 * Robust clipboard copy.
 *
 * `navigator.clipboard.writeText` is undefined on http origins and in several
 * in-app browsers (TikTok/FB/WebView) — exactly where merchants copy a
 * referral link or caption. It can also reject with NotAllowedError even when
 * defined. So we always fall back to a hidden textarea + execCommand, with the
 * iOS quirks handled (focus + setSelectionRange).
 *
 * Returns true on success, false when the browser blocked everything — caller
 * must then show a manual-copy hint instead of staying silent.
 */
export async function copyTextToClipboard(value: string): Promise<boolean> {
  if (!value) return false;

  // 1. Modern async clipboard.
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to legacy path
  }

  // 2. Legacy execCommand fallback (works on http + older WebViews).
  try {
    if (typeof document === "undefined") return false;
    const area = document.createElement("textarea");
    area.value = value;
    // Must be editable for iOS Safari — readonly textareas cannot be selected.
    area.readOnly = false;
    area.setAttribute("aria-hidden", "true");
    area.tabIndex = -1;
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "0";
    area.style.width = "1px";
    area.style.height = "1px";
    area.style.opacity = "0";
    area.style.pointerEvents = "none";
    document.body.appendChild(area);
    area.focus({ preventScroll: true });
    area.select();
    // iOS needs an explicit range.
    try {
      area.setSelectionRange(0, area.value.length);
    } catch {
      // non-iOS browsers may throw — selection from select() is enough.
    }
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    if (ok) return true;
  } catch {
    // fall through
  }

  return false;
}

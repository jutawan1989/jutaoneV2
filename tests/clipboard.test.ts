import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { copyTextToClipboard } from "@/lib/clipboard";

describe("copyTextToClipboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false for empty value without touching the DOM", async () => {
    await expect(copyTextToClipboard("")).resolves.toBe(false);
    await expect(copyTextToClipboard(null as unknown as string)).resolves.toBe(false);
  });

  it("uses the modern clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyTextToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when the modern API rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const select = vi.fn();
    const setSelectionRange = vi.fn();
    const focus = vi.fn();
    const setAttribute = vi.fn();
    const area = { select, setSelectionRange, focus, setAttribute, style: {}, value: "" } as unknown as HTMLTextAreaElement;
    const createElement = vi.fn().mockReturnValue(area);
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal("document", {
      createElement,
      body: { appendChild, removeChild },
      execCommand,
    } as unknown as Document);

    await expect(copyTextToClipboard("fallback")).resolves.toBe(true);
    expect(createElement).toHaveBeenCalledWith("textarea");
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("returns false when everything is blocked", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", undefined as unknown as Document);
    await expect(copyTextToClipboard("x")).resolves.toBe(false);
  });
});

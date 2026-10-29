"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { CHAT_API, isInsufficient, paywallMessage } from "@/lib/ai-tools";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/** Event a dashboard card dispatches to pop the chat window open. */
export const OPEN_CHAT_EVENT = "jutaone:open-chat";

type ChatMessage = { role: "user" | "assistant" | "system"; text: string };

type ChatResponse = {
  ok?: boolean;
  answer?: string;
  code?: string;
  message?: string;
  required?: number;
  balance?: number;
  billing?: { chargedTokens: number; balanceAfter: number; replayed?: boolean };
};

/**
 * Floating member chatbot (Boss spec Task 3).
 *
 * Rendered only inside the members area (`/dashboard`), so every viewer is a
 * signed-in member with a token ledger — no anonymous quota path here. One
 * answered reply costs 5,000 tokens (`CHAT_API.costTokens`, enforced in
 * `/api/chat`); a failed generation is free and never charged.
 */
export function MemberChatFloat({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function pop() {
      setOpen(true);
    }
    window.addEventListener(OPEN_CHAT_EVENT, pop);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, pop);
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = listRef.current;
    if (root) root.scrollTop = root.scrollHeight;
  }, [messages, open, busy]);

  const send = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const text = input.trim();
      if (text.length < 2 || busy) return;
      setBusy(true);
      setMessages((prev) => [...prev, { role: "user", text }]);
      setInput("");

      try {
        const rid = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
        const response = await fetch(CHAT_API.url, {
          method: CHAT_API.method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, locale, rid }),
        });
        const data = (await response.json().catch(() => null)) as ChatResponse | null;

        if (response.status === 402 && data && isInsufficient(data)) {
          setMessages((prev) => [
            ...prev,
            { role: "system", text: paywallMessage(data.required, data.balance) },
          ]);
          return;
        }
        if (response.status === 401) {
          setMessages((prev) => [
            ...prev,
            { role: "system", text: "Sesi tamat. Sila log keluar dan log masuk semula." },
          ]);
          return;
        }
        if (!response.ok || !data?.answer) {
          setMessages((prev) => [
            ...prev,
            { role: "system", text: "Perunding AI sibuk buat masa ini. Cuba lagi sebentar." },
          ]);
          return;
        }
        setMessages((prev) => [...prev, { role: "assistant", text: data.answer as string }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "system", text: "Rangkaian bermasalah. Cuba lagi." },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, input, locale],
  );

  return (
    <div className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-end gap-3 lg:bottom-6 lg:right-6">
      {open && (
        <section
          role="dialog"
          aria-modal="false"
          aria-label="Chat AI Perunding Bisnes"
          className="modal-enter panel flex h-[min(480px,62dvh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden"
        >
          <header className="flex items-center gap-2.5 border-b border-white/[0.07] p-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand ring-1 ring-brand/25 ring-inset">
              <MessageCircle className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-white">Chat AI · Perunding Bisnes</p>
              <p className="text-[10px] text-muted">Tolak {CHAT_API.costTokens.toLocaleString("en-US")} token setiap jawapan</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Tutup chat"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <X className="size-4" />
            </button>
          </header>

          <div ref={listRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3.5" aria-live="polite">
            {messages.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
                <p className="text-xs font-medium text-silver">Tanya apa-apa tentang bisnes anda</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  Contoh: “Macam mana nak naikkan jualan TikTok bulan ni?”
                </p>
              </div>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed break-words",
                  message.role === "user"
                    ? "ml-auto rounded-br-md bg-brand-strong text-white"
                    : message.role === "assistant"
                      ? "rounded-bl-md border border-white/[0.07] bg-white/[0.04] text-silver"
                      : "mx-auto max-w-full rounded-xl border border-amber-500/25 bg-amber-500/10 text-center text-[11px] text-amber-200",
                )}
              >
                {message.text}
              </div>
            ))}
            {busy && (
              <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-white/[0.07] bg-white/[0.04] px-3 py-2.5">
                <span className="ai-dots text-muted" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
                <span className="sr-only">Perunding AI sedang menaip…</span>
              </div>
            )}
          </div>

          <form onSubmit={send} className="border-t border-white/[0.07] p-2.5">
            <div className="flex items-center gap-2">
              <label htmlFor="member-chat-input" className="sr-only">
                Mesej kepada Perunding Bisnes
              </label>
              <input
                id="member-chat-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Tulis soalan bisnes…"
                maxLength={2000}
                autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[13px] text-white placeholder:text-muted/70 focus:border-brand/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || input.trim().length < 2}
                aria-label="Hantar mesej"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-strong text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            </div>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Tutup Chat AI" : "Buka Chat AI"}
        aria-expanded={open}
        className="cta-glow flex h-14 w-14 items-center justify-center rounded-full bg-brand-strong text-white transition-transform hover:scale-105 active:scale-95"
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>
    </div>
  );
}

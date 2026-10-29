"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

/**
 * Frictionless registration (CTO spec: max 3 clicks Daftar → Top-Up $1,
 * no long forms). Only e-mel + kata laluan are required; nama is optional
 * and derived from the e-mel when left blank. No confirm-password field —
 * mismatch friction costs more signups than it saves.
 *
 * Posts to /api/auth with mode=register. On success the browser lands on
 * /dashboard where the Top-Up $1 CTA is one tap away.
 */
export function MemberRegisterForm({ next, referredBy = null }: { next: string; referredBy?: string | null }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
      setError("Masukkan e-mel yang sah.");
      return;
    }
    if (password.length < 8) {
      setError("Kata laluan perlu sekurang-kurangnya 8 aksara.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const displayName = name.trim() || trimmedEmail.split("@")[0] || "";
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          displayName,
          mode: "register",
          ...(referredBy ? { ref: referredBy } : {}),
        }),
      });
      const data = await response.json();

      if (response.ok && data.ok) {
        window.location.href = next.startsWith("/") ? next : "/dashboard";
        return;
      }

      const messages: Record<string, string> = {
        invalid_credentials: "E-mel atau kata laluan tidak betul.",
        email_taken: "E-mel ini sudah didaftarkan. Sila log masuk.",
        email_invalid: "Format e-mel tidak sah.",
        password_too_short: "Kata laluan perlu sekurang-kurangnya 8 aksara.",
        too_many_attempts: "Terlalu banyak percubaan. Cuba lagi selepas 10 minit.",
        register_failed: "Pendaftaran gagal. Sila cuba lagi.",
      };
      setError(messages[data.code] ?? "Pendaftaran gagal. Sila cuba lagi.");
      setPassword("");
    } catch {
      setError("Rangkaian bermasalah. Sila cuba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1.5 min-h-[48px] w-full rounded-xl border border-line bg-ink-2/70 px-3.5 py-3 text-[15px] text-white placeholder:text-muted/70 focus:border-brand focus:outline-none";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="card rounded-2xl p-6 sm:p-7">
        <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
          JutaOne.Biz
        </p>
        <h1 className="mt-2 text-[22px] leading-tight font-semibold tracking-[-0.02em] text-white">
          Daftar — 30 saat siap
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Satu akaun untuk token, kedai dan pendapatan afiliasi. Lepas daftar terus boleh Top-Up $1.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3.5">
          <div>
            <label htmlFor="r-email" className="block text-sm font-medium text-white">
              E-mel
            </label>
            <input
              id="r-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              inputMode="email"
              className={inputClass}
              placeholder="anda@contoh.com"
            />
          </div>
          <div>
            <label htmlFor="r-pass" className="block text-sm font-medium text-white">
              Kata laluan
            </label>
            <input
              id="r-pass"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
              placeholder="Min. 8 aksara"
            />
          </div>
          <details className="rounded-xl border border-line/60 px-3.5 py-2.5">
            <summary className="cursor-pointer text-[13px] font-medium text-muted transition-colors hover:text-white">
              Tambah nama? <span className="font-normal">(pilihan)</span>
            </summary>
            <label htmlFor="r-name" className="mt-2 block text-sm font-medium text-white">
              Nama penuh
            </label>
            <input
              id="r-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              className={inputClass}
              placeholder="Nama anda"
            />
          </details>

          <button type="submit" disabled={busy} className="btn-brand btn-glow cta-glow min-h-[52px] w-full text-base font-bold">
            {busy ? "Memproses…" : "Daftar & Teruskan →"}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-center gap-4 text-center text-[12px] text-muted">
          <span>⭐ 1,000+ peniaga</span>
          <span aria-hidden>•</span>
          <span>🔒 Data selamat</span>
        </div>

        <Link
          href={next === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(next)}`}
          className="mt-4 flex min-h-[44px] items-center justify-center rounded-xl text-sm font-medium text-muted transition-colors hover:text-white"
        >
          Sudah ada akaun? Log masuk
        </Link>

        <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted/80">
          Kata laluan disimpan sebagai hash scrypt, bukan teks biasa.
        </p>
      </div>
    </main>
  );
}

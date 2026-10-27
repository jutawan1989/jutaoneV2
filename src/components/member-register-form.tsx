"use client";

import { useState, type FormEvent } from "react";

/**
 * Registration form: full name + email + password + confirm.
 *
 * Posts to /api/auth with mode=register, which joins the new account to the
 * visitor hash of this browser — any tokens, store or affiliate data created
 * here before signing up is already theirs. On success the API sets the
 * session cookie and the browser lands on /dashboard.
 */
export function MemberRegisterForm({ next }: { next: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (password !== confirm) {
      setError("Pengesahan kata laluan tidak sepadan.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, displayName: name.trim(), mode: "register" }),
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
      setConfirm("");
    } catch {
      setError("Rangkaian bermasalah. Sila cuba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-line bg-ink-2/70 px-3.5 py-2.5 text-sm text-white placeholder:text-muted/70 focus:border-brand focus:outline-none";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <div className="card p-6">
        <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
          JutaOne.Biz
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-white">
          Daftar akaun
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Satu akaun untuk token, kedai dan pendapatan afiliasi anda.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <label htmlFor="r-name" className="block text-sm font-medium text-white">
              Nama penuh
            </label>
            <input
              id="r-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoComplete="name"
              className={inputClass}
              placeholder="Nama anda"
            />
          </div>
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
              placeholder="Sekurang-kurangnya 8 aksara"
            />
          </div>
          <div>
            <label htmlFor="r-confirm" className="block text-sm font-medium text-white">
              Sahkan kata laluan
            </label>
            <input
              id="r-confirm"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
              placeholder="Taip semula kata laluan"
            />
          </div>

          <button type="submit" disabled={busy} className="btn-brand w-full">
            {busy ? "Memproses…" : "Daftar"}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <a
          href={next === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(next)}`}
          className="mt-4 block w-full text-center text-sm text-muted transition-colors hover:text-white"
        >
          Sudah ada akaun? Log masuk
        </a>

        <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted/80">
          Kata laluan disimpan sebagai hash scrypt, bukan teks biasa.
        </p>
      </div>
    </main>
  );
}

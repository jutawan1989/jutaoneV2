"use client";

import { useState, type FormEvent } from "react";

/**
 * Email + password sign-in and registration.
 *
 * One form toggles between the two modes rather than two pages: a merchant who
 * lands here without an account should not have to find a different screen.
 *
 * The copy states why email-based magic links are not used yet — the project has
 * no SMTP configured, so a "we sent you a link" message would be a lie.
 */
export function MemberLoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, mode }),
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
      setError(messages[data.code] ?? "Log masuk gagal. Sila cuba lagi.");
      setPassword("");
    } catch {
      setError("Rangkaian bermasalah. Sila cuba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <div className="card p-6">
        <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
          JutaOne.Biz
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-white">
          {mode === "login" ? "Log masuk" : "Daftar akaun"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {mode === "login"
            ? "Akses token, kedai dan rangkaian afiliasi anda dari mana-mana peranti."
            : "Akaun menyambungkan e-mel anda kepada data yang sudah ada pada peranti ini."}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <label htmlFor="m-email" className="block text-sm font-medium text-white">
              E-mel
            </label>
            <input
              id="m-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="mt-1.5 w-full rounded-lg border border-line bg-ink-2/70 px-3.5 py-2.5 text-sm text-white placeholder:text-muted/70 focus:border-brand focus:outline-none"
              placeholder="anda@contoh.com"
            />
          </div>
          <div>
            <label htmlFor="m-pass" className="block text-sm font-medium text-white">
              Kata laluan
            </label>
            <input
              id="m-pass"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="mt-1.5 w-full rounded-lg border border-line bg-ink-2/70 px-3.5 py-2.5 text-sm text-white placeholder:text-muted/70 focus:border-brand focus:outline-none"
              placeholder="Sekurang-kurangnya 8 aksara"
            />
          </div>

          <button type="submit" disabled={busy} className="btn-brand w-full">
            {busy ? "Memproses…" : mode === "login" ? "Log masuk" : "Daftar"}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
          className="mt-4 w-full text-center text-sm text-muted transition-colors hover:text-white"
        >
          {mode === "login" ? "Belum ada akaun? Daftar" : "Sudah ada akaun? Log masuk"}
        </button>

        <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted/80">
          Pautan ajaib melalui e-mel belum aktif kerana penghantaran e-mel belum
          dikonfigurasikan. Kata laluan disimpan sebagai hash scrypt, bukan teks biasa.
        </p>
      </div>
    </main>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

export function AdminLoginForm() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        // Full navigation so the server sees the new cookie immediately.
        window.location.href = "/admin";
        return;
      }

      if (response.status === 429) {
        setError("Too many attempts. Try again later.");
      } else if (response.status === 503) {
        setError("Playground is not configured. Set ADMIN_TEST_PASSWORD.");
      } else {
        setError("Incorrect password.");
      }
      setPassword("");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <div className="card p-6">
        <h1 className="text-lg font-semibold tracking-[-0.02em] text-white">
          Admin panel
        </h1>
        <p className="mt-2 text-sm text-muted">
          Not part of the public site. Enter the admin password to continue.
        </p>

        <form onSubmit={submit} className="mt-6">
          <label htmlFor="admin-password" className="block text-sm font-medium text-white">
            Password
          </label>
          <div className="relative">
            <input
              id="admin-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              required
              className="mt-2 w-full rounded-lg border border-line bg-ink-2/70 px-3.5 py-2.5 pr-11 text-sm text-white transition-colors placeholder:text-muted/70 focus:border-brand focus:outline-none"
              placeholder="••••••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-3 -translate-y-1/2 pt-2 text-slate-400 transition-colors hover:text-white"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>

          <button type="submit" disabled={busy} className="btn-brand mt-4 w-full">
            {busy ? "Checking…" : "Sign in"}
          </button>

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {error}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}

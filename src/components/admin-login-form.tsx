"use client";

import { useState, type FormEvent } from "react";

export function AdminLoginForm() {
  const [password, setPassword] = useState("");
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
        window.location.href = "/admin/playground";
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
          Internal playground
        </h1>
        <p className="mt-2 text-sm text-muted">
          Not part of the public site. Enter the admin password to continue.
        </p>

        <form onSubmit={submit} className="mt-6">
          <label htmlFor="admin-password" className="block text-sm font-medium text-white">
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            className="mt-2 w-full rounded-lg border border-line bg-ink-2/70 px-3.5 py-2.5 text-sm text-white transition-colors placeholder:text-muted/70 focus:border-brand focus:outline-none"
            placeholder="••••••••••••"
          />

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

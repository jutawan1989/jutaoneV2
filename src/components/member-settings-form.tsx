"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Initial = {
  email: string;
  displayName: string;
  bankName: string;
  accountNo: string;
  accountHolder: string;
};

const INPUT =
  "mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-none focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100";
const LIGHT = { colorScheme: "light" } as const;

const LABEL = "text-[11px] font-medium tracking-[0.1em] text-slate-500 uppercase";

export function MemberSettingsForm({ initial }: { initial: Initial }) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [bankName, setBankName] = useState(initial.bankName);
  const [accountNo, setAccountNo] = useState(initial.accountNo);
  const [accountHolder, setAccountHolder] = useState(initial.accountHolder);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [noteTone, setNoteTone] = useState<"ok" | "err">("ok");

  // Keep server-loaded values if the session profile arrives late.
  useEffect(() => {
    setDisplayName(initial.displayName);
    setBankName(initial.bankName);
    setAccountNo(initial.accountNo);
    setAccountHolder(initial.accountHolder);
  }, [initial.displayName, initial.bankName, initial.accountNo, initial.accountHolder]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setNote(null);
    try {
      const response = await fetch("/api/member/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
          confirmPassword: confirmPassword || undefined,
          bankName,
          accountNo,
          accountHolder,
        }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok) {
        setNote(
          data?.bank_unsaved
            ? "Profil & kata laluan disimpan. Butiran bank belum disimpan (DB belum migrate)."
            : "Perubahan berjaya disimpan.",
        );
        setNoteTone("ok");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        return;
      }
      const code = (data as { code?: string } | null)?.code ?? "";
      const messages: Record<string, string> = {
        current_password_wrong: "Kata laluan lama salah. Sila cuba lagi.",
        password_mismatch: "Pengesahan kata laluan baharu tidak sepadan.",
        password_too_short: "Kata laluan baharu minimum 8 aksara.",
        password_incomplete: "Lengkapkan kata laluan lama, baharu dan pengesahan.",
        unauthorised: "Sesi tamat. Sila log masuk semula.",
      };
      setNote(messages[code] ?? "Gagal menyimpan. Sila cuba lagi.");
      setNoteTone("err");
    } catch {
      setNote("Rangkaian bermasalah. Sila cuba lagi.");
      setNoteTone("err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Profil */}
      <Card className="gap-0 rounded-2xl border border-slate-200 bg-white py-0 shadow-sm ring-0">
        <CardContent className="p-5 sm:p-6">
          <h2 className="text-[13px] font-semibold text-slate-900">Profil</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Nama penuh dipaparkan di dashboard. Emel tidak boleh ditukar.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="settings-name" className={LABEL}>
                Nama Penuh
              </label>
              <input
                id="settings-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Cth: Ahmad Bin Ali"
                autoComplete="name"
                style={LIGHT}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="settings-email" className={LABEL}>
                Emel
              </label>
              <input
                id="settings-email"
                value={initial.email}
                disabled
                readOnly
                autoComplete="email"
                style={LIGHT}
                className={INPUT}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tukar Kata Laluan */}
      <Card className="gap-0 rounded-2xl border border-slate-200 bg-white py-0 shadow-sm ring-0">
        <CardContent className="p-5 sm:p-6">
          <h2 className="text-[13px] font-semibold text-slate-900">Tukar Kata Laluan</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Biarkan kosong jika tidak mahu tukar kata laluan.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="settings-current" className={LABEL}>
                Kata Laluan Lama
              </label>
              <input
                id="settings-current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={LIGHT}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="settings-new" className={LABEL}>
                Kata Laluan Baharu
              </label>
              <div className="relative mt-1.5">
                <input
                  id="settings-new"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 aksara"
                  autoComplete="new-password"
                  style={LIGHT}
                  className={`pr-11 ${INPUT}`}
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  aria-label={showNew ? "Sembunyi kata laluan" : "Tunjuk kata laluan"}
                  aria-pressed={showNew}
                  className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="settings-confirm" className={LABEL}>
                Sahkan Kata Laluan Baharu
              </label>
              <input
                id="settings-confirm"
                type={showNew ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulang kata laluan baharu"
                autoComplete="new-password"
                style={LIGHT}
                className={INPUT}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Butiran Bank */}
      <Card className="gap-0 rounded-2xl border border-slate-200 bg-white py-0 shadow-sm ring-0">
        <CardContent className="p-5 sm:p-6">
          <h2 className="text-[13px] font-semibold text-slate-900">Butiran Bank (Untuk Payout)</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Digunakan untuk pembayaran komisen manual oleh admin.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="settings-bank" className={LABEL}>
                Nama Bank
              </label>
              <input
                id="settings-bank"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Cth: Maybank"
                autoComplete="off"
                style={LIGHT}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="settings-account" className={LABEL}>
                Nombor Akaun
              </label>
              <input
                id="settings-account"
                value={accountNo}
                onChange={(e) => setAccountNo(e.target.value)}
                placeholder="Cth: 1234567890"
                inputMode="numeric"
                autoComplete="off"
                style={LIGHT}
                className={INPUT}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="settings-holder" className={LABEL}>
                Nama Pemegang Akaun
              </label>
              <input
                id="settings-holder"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                placeholder="Nama seperti dalam akaun bank"
                autoComplete="off"
                style={LIGHT}
                className={INPUT}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {note && (
        <p
          role="status"
          className={
            noteTone === "ok"
              ? "rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[12px] leading-relaxed text-emerald-800"
              : "rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] leading-relaxed text-red-700"
          }
        >
          {note}
        </p>
      )}

      <Button
        type="button"
        onClick={save}
        disabled={saving}
        className="min-h-[48px] w-full gap-2 rounded-xl bg-brand text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {saving ? "Menyimpan…" : "Simpan Perubahan"}
      </Button>
    </div>
  );
}

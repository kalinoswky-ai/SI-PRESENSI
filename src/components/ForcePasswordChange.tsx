"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { KeyRound, Eye, EyeOff, LogOut } from "lucide-react";

const MIN_LENGTH = 8;

/** Form ganti password wajib pada login pertama (akun hasil import Excel). */
export default function ForcePasswordChange() {
  const router = useRouter();
  const supabase = createClient();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < MIN_LENGTH) {
      setError(`Password baru minimal ${MIN_LENGTH} karakter.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password tidak sama dengan password baru.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Password baru harus berbeda dari password awal.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Gagal mengubah password.");
        setSaving(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Terjadi kesalahan koneksi.");
      setSaving(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const inputType = showPassword ? "text" : "password";

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="text-brand-600" size={20} />
        <h2 className="font-semibold text-slate-800">Buat Password Baru</h2>
      </div>

      <div>
        <label className="label" htmlFor="current-password">Password Awal (dari Admin)</label>
        <input
          id="current-password"
          type={inputType}
          required
          autoComplete="current-password"
          className="input"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor="new-password">Password Baru</label>
        <input
          id="new-password"
          type={inputType}
          required
          minLength={MIN_LENGTH}
          autoComplete="new-password"
          className="input"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={`Minimal ${MIN_LENGTH} karakter`}
        />
      </div>
      <div>
        <label className="label" htmlFor="confirm-password">Ulangi Password Baru</label>
        <input
          id="confirm-password"
          type={inputType}
          required
          autoComplete="new-password"
          className="input"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
        Tampilkan password
      </label>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary w-full">
        <KeyRound size={18} />
        {saving ? "Menyimpan..." : "Simpan & Lanjutkan"}
      </button>
      <button type="button" onClick={handleLogout} className="btn-secondary w-full">
        <LogOut size={16} />
        Keluar
      </button>
    </form>
  );
}

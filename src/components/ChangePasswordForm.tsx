"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { KeyRound, Eye, EyeOff, CheckCircle2 } from "lucide-react";

const MIN_LENGTH = 8;

/**
 * Form ganti password mandiri — dipakai oleh semua role (Admin, Pimpinan, Pegawai).
 * Setiap pengguna hanya bisa mengubah password akunnya sendiri. Password lama
 * diverifikasi dulu (login ulang) sebelum password baru disimpan.
 */
export default function ChangePasswordForm() {
  const supabase = createClient();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function translateError(message: string): string {
    const m = message.toLowerCase();
    if (m.includes("different from the old password")) return "Password baru harus berbeda dari password lama.";
    if (m.includes("weak") || m.includes("at least")) return `Password terlalu lemah. Gunakan minimal ${MIN_LENGTH} karakter.`;
    if (m.includes("rate limit") || m.includes("too many")) return "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.";
    return "Gagal mengubah password: " + message;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < MIN_LENGTH) {
      setError(`Password baru minimal ${MIN_LENGTH} karakter.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password tidak sama dengan password baru.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Password baru harus berbeda dari password lama.");
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (!email) {
        setError("Sesi login tidak ditemukan. Silakan login ulang.");
        return;
      }

      // 1. Verifikasi password lama dengan login ulang
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (verifyError) {
        setError("Password lama salah.");
        return;
      }

      // 2. Simpan password baru
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(translateError(updateError.message));
        return;
      }

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Terjadi kesalahan koneksi.");
    } finally {
      setSaving(false);
    }
  }

  const inputType = showPassword ? "text" : "password";

  return (
    <form id="keamanan" onSubmit={handleSubmit} className="card scroll-mt-24 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="text-brand-600" size={20} />
        <h2 className="font-semibold text-slate-800">Ubah Password</h2>
      </div>
      <p className="text-sm text-slate-500">
        Akun Anda dibuat oleh Admin dengan password awal. Demi keamanan, silakan ganti dengan
        password pribadi Anda sendiri. Password ini hanya berlaku untuk akun Anda.
      </p>

      <div>
        <label className="label" htmlFor="current-password">Password Saat Ini</label>
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

      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
        Tampilkan password
      </label>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {success && (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 size={16} /> Password berhasil diubah. Gunakan password baru saat login berikutnya.
        </p>
      )}

      <button type="submit" disabled={saving} className="btn-primary w-full">
        <KeyRound size={18} />
        {saving ? "Menyimpan..." : "Simpan Password Baru"}
      </button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { KeyRound, Copy } from "lucide-react";
import Modal from "@/components/Modal";

export default function ResetPasswordButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ password: string | null; typed: boolean; flagOk: boolean } | null>(null);

  function close() {
    setOpen(false);
    setCustom("");
    setError(null);
    setResult(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/employees/${id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: custom }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Gagal mereset password.");
        return;
      }
      setResult({ password: json.temporaryPassword ?? custom, typed: Boolean(custom), flagOk: json.mustChangeFlagSet });
    } catch {
      setError("Terjadi kesalahan koneksi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary">
        <KeyRound size={16} /> Reset Password
      </button>
      {open && (
        <Modal title={`Reset password — ${name}`} onClose={close} busy={busy}>
          {result ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Password baru sudah aktif. Sampaikan ke pegawai secara langsung/aman. Pegawai
                {result.flagOk ? " wajib menggantinya saat login berikutnya." : " disarankan segera menggantinya."}
              </p>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <code className="text-base font-bold tracking-wide text-slate-900">{result.password}</code>
                <button
                  onClick={() => navigator.clipboard?.writeText(result.password ?? "")}
                  className="text-slate-500 hover:text-slate-800"
                  title="Salin"
                >
                  <Copy size={16} />
                </button>
              </div>
              <p className="text-xs text-amber-700">Password ini hanya tampil sekali dan tidak disimpan di sistem.</p>
              <button onClick={close} className="btn-primary">Selesai</button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Password lama tidak dapat dilihat (disimpan terenkripsi). Anda dapat memberi password baru:
                kosongkan kolom di bawah agar sistem membuatkan password acak, atau ketik sendiri (min. 8 karakter).
              </p>
              <input
                className="input"
                placeholder="Kosongkan = buat otomatis"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={close} disabled={busy} className="btn-secondary">Batal</button>
                <button onClick={submit} disabled={busy} className="btn-primary">
                  {busy ? "Memproses..." : "Reset Password"}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

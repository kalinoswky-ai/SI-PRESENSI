"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import Modal from "@/components/Modal";

export default function DeleteEmployeeButton({
  id,
  name,
  redirectTo,
  compact = false,
}: {
  id: string;
  name: string;
  redirectTo?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setConfirmText("");
    setError(null);
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Gagal menghapus pegawai.");
        setBusy(false);
        return;
      }
      close();
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Terjadi kesalahan koneksi.");
    }
    setBusy(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          compact
            ? "inline-flex items-center gap-1 text-red-600 hover:underline"
            : "btn-secondary !border-red-200 !text-red-600"
        }
      >
        <Trash2 size={compact ? 14 : 16} />
        Hapus
      </button>

      {open && (
        <Modal title="Hapus Pegawai Permanen" onClose={close} busy={busy}>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Anda akan menghapus <strong>{name}</strong>. Akun login, seluruh data absensi, pengajuan
              cuti/izin, serta foto wajah &amp; selfie pegawai ini akan hilang <strong>permanen</strong>.
            </p>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Bila pegawai hanya pindah tugas/pensiun dan datanya masih perlu untuk laporan, gunakan{" "}
              <strong>Nonaktifkan</strong> di halaman Kelola Pegawai — data historis tetap tersimpan.
            </p>
            <div>
              <label className="label">
                Ketik <span className="font-mono text-red-600">HAPUS</span> untuk melanjutkan
              </label>
              <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            </div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={close} disabled={busy} className="btn-secondary">
                Batal
              </button>
              <button
                onClick={run}
                disabled={busy || confirmText !== "HAPUS"}
                className="btn-primary !bg-none bg-red-600 hover:bg-red-700"
              >
                {busy ? "Menghapus..." : "Hapus Permanen"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

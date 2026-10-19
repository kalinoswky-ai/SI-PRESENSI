"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import Modal from "./Modal";

/**
 * Hapus data absensi per rentang tanggal (dipakai di menu Reports):
 * per pegawai, hanya yang berstatus Ditolak, atau seluruh data pada rentang.
 * Wajib alasan + ketik "HAPUS"; tercatat di audit_log oleh server.
 */
export default function DeleteAttendanceRangeButton({
  from,
  to,
  count,
  label,
  description,
  employeeId,
  status,
  compact = false,
}: {
  from: string;
  to: string;
  count: number;
  label: string;
  description: string;
  employeeId?: string;
  status?: "rejected" | "valid";
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setReason("");
    setConfirmText("");
    setError(null);
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/attendance/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          filter: { from, to, ...(employeeId ? { employee_id: employeeId } : {}), ...(status ? { status } : {}) },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Gagal menghapus data.");
        setBusy(false);
        return;
      }
      close();
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
            ? "inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
            : "btn-secondary !border-red-200 !text-red-600"
        }
      >
        <Trash2 size={compact ? 13 : 16} />
        {label}
      </button>

      {open && (
        <Modal title={label} onClose={close} busy={busy}>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {description} Periode <strong>{from}</strong> s/d <strong>{to}</strong> — sekitar{" "}
              <strong>{count}</strong> data absensi akan dihapus <strong>permanen</strong>. Tindakan ini tidak
              dapat dibatalkan, tetapi tercatat di Riwayat Perubahan.
            </p>
            <div>
              <label className="label">Alasan penghapusan (wajib)</label>
              <input
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: data uji coba sistem"
              />
            </div>
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
                disabled={busy || reason.trim().length < 3 || confirmText !== "HAPUS"}
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

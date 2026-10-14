"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

/** Tombol setujui/tolak koreksi absensi. Kewenangan tetap diperiksa ulang di API (server). */
export default function CorrectionActions({ id }: { id: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(status: "approved" | "rejected") {
    if (status === "rejected" && note.trim().length < 3) {
      setError("Alasan penolakan wajib diisi (minimal 3 karakter).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/corrections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, review_note: note.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Gagal memproses pengajuan.");
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Terjadi kesalahan koneksi.");
      setLoading(false);
    }
  }

  if (mode === "idle") {
    return (
      <div className="flex gap-2 border-t border-slate-100 pt-3">
        <button onClick={() => setMode("approve")} className="btn-primary bg-emerald-600 hover:bg-emerald-700">
          <CheckCircle2 size={16} />
          Setujui
        </button>
        <button onClick={() => setMode("reject")} className="btn-secondary">
          <XCircle size={16} />
          Tolak
        </button>
      </div>
    );
  }

  const approving = mode === "approve";
  return (
    <div className="space-y-2 border-t border-slate-100 pt-3">
      <p className="text-xs text-slate-500">
        {approving
          ? "Menyetujui akan MENGUBAH data absensi resmi pegawai dan tercatat di Riwayat Perubahan."
          : "Pengajuan ditolak; data absensi tidak berubah."}
      </p>
      <input
        className="input"
        placeholder={approving ? "Catatan keputusan (opsional)" : "Alasan penolakan (wajib)"}
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => {
            setMode("idle");
            setError(null);
          }}
          className="btn-secondary"
          disabled={loading}
        >
          Batal
        </button>
        <button
          onClick={() => submit(approving ? "approved" : "rejected")}
          className={approving ? "btn-primary bg-emerald-600 hover:bg-emerald-700" : "btn-primary"}
          disabled={loading}
        >
          {loading ? "Memproses..." : approving ? "Konfirmasi Setujui" : "Konfirmasi Tolak"}
        </button>
      </div>
    </div>
  );
}

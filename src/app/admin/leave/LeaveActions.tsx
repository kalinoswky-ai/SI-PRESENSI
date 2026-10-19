"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

export default function LeaveActions({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showRejectNote, setShowRejectNote] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function review(status: "approved" | "rejected") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, review_note: status === "rejected" ? note : null }),
      });
      const json = await res.json();
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

  if (showRejectNote) {
    return (
      <div className="space-y-2 border-t border-slate-100 pt-3">
        <input
          className="input"
          placeholder="Alasan penolakan (opsional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={() => setShowRejectNote(false)} className="btn-secondary" disabled={loading}>
            Batal
          </button>
          <button onClick={() => review("rejected")} className="btn-primary" disabled={loading}>
            {loading ? "Memproses..." : "Konfirmasi Tolak"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 border-t border-slate-100 pt-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={() => review("approved")}
        disabled={loading}
        className="btn-primary bg-emerald-600 hover:bg-emerald-700"
      >
        <CheckCircle2 size={16} />
        Setujui
      </button>
      <button onClick={() => setShowRejectNote(true)} disabled={loading} className="btn-secondary">
        <XCircle size={16} />
        Tolak
      </button>
    </div>
  );
}

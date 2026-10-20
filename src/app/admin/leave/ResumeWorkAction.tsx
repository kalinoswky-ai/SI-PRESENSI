"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck } from "lucide-react";

/**
 * Otorisasi Admin utama: pegawai masuk lebih awal dari jadwal cuti/izin/sakit/dinas.
 * Admin memilih tanggal masuk kembali (min. hari ini, dalam masa pengajuan) + alasan.
 */
export default function ResumeWorkAction({
  id,
  minDate,
  maxDate,
}: {
  id: string;
  minDate: string; // tanggal terkecil yang boleh dipilih (>= hari ini & >= awal pengajuan)
  maxDate: string; // akhir pengajuan
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(minDate);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leave/${id}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_date: date, note }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Gagal menyimpan.");
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Terjadi kesalahan koneksi.");
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div className="border-t border-slate-100 pt-3">
        <button onClick={() => setOpen(true)} className="btn-secondary">
          <CalendarCheck size={16} />
          Atur Masuk Lebih Awal
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t border-slate-100 pt-3">
      <p className="text-xs text-slate-500">
        Pegawai masuk kerja lebih awal dari jadwal. Mulai tanggal di bawah, pegawai dapat dan wajib absen seperti
        biasa; sisa masa pengajuan dihapus. Tindakan ini tercatat di Riwayat Perubahan.
      </p>
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <div>
          <label className="label">Tanggal masuk kembali</label>
          <input type="date" className="input" min={minDate} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Alasan (wajib)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. sudah sembuh, diminta masuk oleh pimpinan" />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="btn-secondary" disabled={loading}>
          Batal
        </button>
        <button onClick={submit} className="btn-primary" disabled={loading || !date || note.trim().length < 3}>
          {loading ? "Menyimpan..." : "Aktifkan Absensi"}
        </button>
      </div>
    </div>
  );
}

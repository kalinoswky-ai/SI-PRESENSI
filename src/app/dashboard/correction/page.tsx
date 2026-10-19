"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatWita, witaDateKey } from "@/lib/geo";
import type { AttendanceCorrection, CorrectionType } from "@/types";
import { CORRECTION_TYPE_LABEL } from "@/types";
import { FilePen, Clock3, CheckCircle2, XCircle, Paperclip } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu Persetujuan",
  approved: "Disetujui",
  rejected: "Ditolak",
};

/** Pengajuan koreksi absensi milik pegawai yang login. Tidak mengubah data absensi resmi. */
export default function CorrectionPage() {
  const supabase = createClient();
  const [records, setRecords] = useState<AttendanceCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [today, setToday] = useState<string>(""); // jam server (WITA)

  const [form, setForm] = useState({ work_date: "", type: "in" as CorrectionType, requested_time: "", reason: "" });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data, error: qErr } = await supabase
      .from("attendance_corrections")
      .select("*")
      .eq("employee_id", userData.user.id)
      .order("created_at", { ascending: false });
    if (qErr) setLoadError("Riwayat pengajuan belum dapat dimuat. Hubungi Admin bila masalah berlanjut.");
    setRecords((data ?? []) as AttendanceCorrection[]);
    setLoading(false);
  }

  useEffect(() => {
    async function init() {
      let now = new Date();
      try {
        const st = await fetch(`/api/server-time?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json());
        now = new Date(st.serverTime);
      } catch {
        // cadangan: jam perangkat hanya untuk batas pilihan tanggal; server tetap memvalidasi
      }
      const key = witaDateKey(now);
      setToday(key);

      // Isi awal dari tautan Kalender (?date=YYYY-MM-DD&type=in|out) bila ada.
      const q = new URLSearchParams(window.location.search);
      const qd = q.get("date");
      const qt = q.get("type");
      const validDate = qd && /^\d{4}-\d{2}-\d{2}$/.test(qd) && qd <= key ? qd : key;
      setForm((f) => ({ ...f, work_date: validDate, type: qt === "out" ? "out" : "in" }));
      if (qd) setShowForm(true);
    }
    init();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!form.work_date || !form.requested_time || form.reason.trim().length < 5) {
      setError("Lengkapi tanggal, jam, dan alasan (minimal 5 karakter).");
      return;
    }
    setSubmitting(true);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    if (attachment) fd.append("attachment", attachment);
    try {
      const res = await fetch("/api/corrections/create", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Gagal mengirim pengajuan.");
        return;
      }
      setForm((f) => ({ ...f, requested_time: "", reason: "" }));
      setAttachment(null);
      setShowForm(false);
      setSuccess(true);
      await load();
    } catch {
      setError("Terjadi kesalahan koneksi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-900">Koreksi Absensi</h1>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
          <FilePen size={18} />
          {showForm ? "Tutup Form" : "Ajukan Koreksi"}
        </button>
      </div>

      <p className="card text-xs text-slate-600">
        Pengajuan tidak langsung mengubah absensi Anda. Data absensi resmi hanya berubah setelah pengajuan disetujui pihak yang berwenang.
      </p>

      {success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Pengajuan terkirim dan menunggu persetujuan.</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="corr-date">Tanggal</label>
              <input
                id="corr-date"
                required
                type="date"
                className="input"
                max={today || undefined}
                value={form.work_date}
                onChange={(e) => update("work_date", e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="corr-type">Jenis Koreksi</label>
              <select id="corr-type" className="input" value={form.type} onChange={(e) => update("type", e.target.value as CorrectionType)}>
                <option value="in">{CORRECTION_TYPE_LABEL.in}</option>
                <option value="out">{CORRECTION_TYPE_LABEL.out}</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="corr-time">Jam yang Diajukan (WITA)</label>
              <input
                id="corr-time"
                required
                type="time"
                className="input"
                value={form.requested_time}
                onChange={(e) => update("requested_time", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="corr-reason">Alasan</label>
            <textarea
              id="corr-reason"
              required
              className="input"
              rows={3}
              maxLength={500}
              value={form.reason}
              onChange={(e) => update("reason", e.target.value)}
              placeholder="Jelaskan alasan koreksi (mis. lupa absen, kendala wajah/GPS)"
            />
          </div>

          <div>
            <label className="label" htmlFor="corr-file">Bukti (opsional — PDF atau gambar, maks. 5 MB)</label>
            <input
              id="corr-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="input"
              onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
            />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Mengirim..." : "Kirim Pengajuan"}
          </button>
        </form>
      )}

      {loadError && <p className="card border-rose-200 bg-rose-50 text-sm text-rose-700">{loadError}</p>}

      {loading ? (
        <p className="text-center text-sm text-slate-500">Memuat...</p>
      ) : records.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada pengajuan koreksi.</p>
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-800">
                    {r.work_date} · {CORRECTION_TYPE_LABEL[r.type]} → {r.requested_time.slice(0, 5)} WITA
                  </p>
                  <p className="text-sm text-slate-500">{r.reason}</p>
                </div>
                <span className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock3 size={12} /> Diajukan {formatWita(new Date(r.created_at))}
                </span>
                {r.attachment_url && (
                  <a
                    href={`/api/leave/attachment?path=${encodeURIComponent(r.attachment_url)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-brand-600"
                  >
                    <Paperclip size={12} /> Lihat bukti
                  </a>
                )}
                {r.status === "approved" && (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 size={12} /> Disetujui{r.reviewed_at ? " " + formatWita(new Date(r.reviewed_at)) : ""}
                  </span>
                )}
                {r.status === "rejected" && (
                  <span className="flex items-center gap-1 text-red-500">
                    <XCircle size={12} /> {r.review_note || "Ditolak"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

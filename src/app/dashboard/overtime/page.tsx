"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatWita, formatDurationMinutes, witaDateKey } from "@/lib/geo";
import type { OvertimeRequest } from "@/types";
import { Timer, Clock3, CheckCircle2, XCircle, Paperclip } from "lucide-react";

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

function calcMinutes(start: string, end: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

export default function OvertimePage() {
  const supabase = createClient();
  const [records, setRecords] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    work_date: witaDateKey(new Date()),
    start_time: "15:00",
    end_time: "17:00",
    description: "",
  });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data } = await supabase
      .from("overtime_requests")
      .select("*")
      .eq("employee_id", userData.user.id)
      .order("work_date", { ascending: false })
      .order("created_at", { ascending: false });
    setRecords((data ?? []) as OvertimeRequest[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const previewMinutes = calcMinutes(form.start_time, form.end_time);

  // Total jam lembur DISETUJUI pada bulan berjalan (WITA).
  const monthTotal = useMemo(() => {
    const month = witaDateKey(new Date()).slice(0, 7);
    return records
      .filter((r) => r.status === "approved" && r.work_date.startsWith(month))
      .reduce((sum, r) => sum + r.duration_minutes, 0);
  }, [records]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.work_date || !form.start_time || !form.end_time || !form.description.trim()) {
      setError("Mohon lengkapi semua data pengajuan.");
      return;
    }
    if (previewMinutes <= 0) {
      setError("Jam selesai harus setelah jam mulai.");
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    Object.entries(form).forEach(([k, v]) => formData.append(k, v));
    if (attachment) formData.append("attachment", attachment);

    try {
      const res = await fetch("/api/overtime/create", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Gagal mengirim pengajuan lembur.");
        setSubmitting(false);
        return;
      }
      setShowForm(false);
      setForm({ work_date: witaDateKey(new Date()), start_time: "15:00", end_time: "17:00", description: "" });
      setAttachment(null);
      if (json.attachmentFailed) {
        window.alert("Pengajuan terkirim, tetapi lampiran gagal diunggah. Hubungi Admin atau ajukan ulang dengan lampiran.");
      }
      await load();
    } catch {
      setError("Terjadi kesalahan koneksi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">Lembur</h1>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
          <Timer size={18} />
          {showForm ? "Tutup Form" : "Ajukan Lembur"}
        </button>
      </div>

      <div className="card flex items-center justify-between">
        <p className="text-sm text-slate-600">Total lembur disetujui bulan ini</p>
        <p className="text-lg font-bold text-brand-700">{formatDurationMinutes(monthTotal)}</p>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Tanggal Lembur</label>
              <input
                required
                type="date"
                className="input"
                value={form.work_date}
                onChange={(e) => update("work_date", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Jam Mulai (WITA)</label>
              <input
                required
                type="time"
                className="input"
                value={form.start_time}
                onChange={(e) => update("start_time", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Jam Selesai (WITA)</label>
              <input
                required
                type="time"
                className="input"
                value={form.end_time}
                onChange={(e) => update("end_time", e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Durasi: <strong>{previewMinutes > 0 ? formatDurationMinutes(previewMinutes) : "-"}</strong>
          </p>

          <div>
            <label className="label">Uraian Pekerjaan</label>
            <textarea
              required
              className="input"
              rows={3}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Jelaskan pekerjaan yang akan dilembur"
            />
          </div>

          <div>
            <label className="label">Lampiran (opsional — mis. surat perintah lembur)</label>
            <input
              type="file"
              accept="image/*,application/pdf"
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

      {loading ? (
        <p className="text-center text-sm text-slate-500">Memuat...</p>
      ) : records.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada pengajuan lembur.</p>
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-800">
                    {r.work_date} · {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)} WITA
                    <span className="ml-2 font-normal text-slate-400">({formatDurationMinutes(r.duration_minutes)})</span>
                  </p>
                  <p className="text-sm text-slate-500">{r.description}</p>
                </div>
                <span className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock3 size={12} /> Diajukan {formatWita(new Date(r.created_at))}
                </span>
                {r.attachment_url && (
                  <span className="flex items-center gap-1">
                    <Paperclip size={12} /> Ada lampiran
                  </span>
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

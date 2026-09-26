"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatWita } from "@/lib/geo";
import type { ApelExemptionReason, LeaveRequest, LeaveType } from "@/types";
import { APEL_EXEMPTION_REASON_LABEL, LEAVE_TYPE_LABEL, isPerjadinType } from "@/types";
import { CalendarPlus, Clock3, CheckCircle2, XCircle, Paperclip } from "lucide-react";

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

export default function LeavePage() {
  const supabase = createClient();
  const [records, setRecords] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    type: "izin" as LeaveType,
    start_date: "",
    end_date: "",
    reason: "",
    destination: "",
    letter_number: "",
    apel_exemption_reason: "" as ApelExemptionReason | "",
  });
  const isPerjadin = isPerjadinType(form.type);
  const isApelExemption = form.type === "pengecualian_apel";
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data } = await supabase
      .from("leave_requests")
      .select("*")
      .eq("employee_id", userData.user.id)
      .order("created_at", { ascending: false });
    setRecords((data ?? []) as LeaveRequest[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.start_date || !form.end_date || !form.reason.trim()) {
      setError("Mohon lengkapi semua data pengajuan.");
      return;
    }
    if (isPerjadin && !form.destination.trim()) {
      setError("Mohon isi tujuan/lokasi penugasan.");
      return;
    }
    if (isApelExemption && !form.apel_exemption_reason) {
      setError("Mohon pilih kategori alasan pengecualian apel.");
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    Object.entries(form).forEach(([k, v]) => formData.append(k, v));
    if (attachment) formData.append("attachment", attachment);

    try {
      const res = await fetch("/api/leave/create", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Gagal mengirim pengajuan.");
        setSubmitting(false);
        return;
      }
      setShowForm(false);
      setForm({
        type: "izin",
        start_date: "",
        end_date: "",
        reason: "",
        destination: "",
        letter_number: "",
        apel_exemption_reason: "",
      });
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
        <h1 className="text-lg font-bold text-slate-900">Cuti / Izin / Sakit / Dinas / Pengecualian Apel</h1>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
          <CalendarPlus size={18} />
          {showForm ? "Tutup Form" : "Ajukan Baru"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Jenis Pengajuan</label>
              <select
                className="input"
                value={form.type}
                onChange={(e) => update("type", e.target.value as LeaveType)}
              >
                <option value="izin">Izin</option>
                <option value="sakit">Sakit</option>
                <option value="cuti">Cuti</option>
                <option value="dinas_dalam">Perjalanan Dinas Dalam Daerah</option>
                <option value="dinas_luar">Perjalanan Dinas Luar Daerah</option>
                <option value="pengecualian_apel">Pengecualian Apel (Sakit/Hamil/Alasan Khusus)</option>
              </select>
            </div>
            <div>
              <label className="label">Tanggal Mulai</label>
              <input
                required
                type="date"
                className="input"
                value={form.start_date}
                onChange={(e) => update("start_date", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Tanggal Selesai</label>
              <input
                required
                type="date"
                className="input"
                value={form.end_date}
                onChange={(e) => update("end_date", e.target.value)}
              />
            </div>
          </div>

          {isPerjadin && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Tujuan / Lokasi Penugasan</label>
                <input
                  required
                  type="text"
                  className="input"
                  value={form.destination}
                  onChange={(e) => update("destination", e.target.value)}
                  placeholder={
                    form.type === "dinas_luar"
                      ? "mis. Kota Kupang / Jakarta"
                      : "mis. Kecamatan Lamboya, Kab. Sumba Barat"
                  }
                />
              </div>
              <div>
                <label className="label">Nomor Surat Tugas (opsional)</label>
                <input
                  type="text"
                  className="input"
                  value={form.letter_number}
                  onChange={(e) => update("letter_number", e.target.value)}
                  placeholder="mis. 094/123/SPT/2026"
                />
              </div>
            </div>
          )}

          {isApelExemption && (
            <div>
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                Pengajuan ini HANYA membebaskan Anda dari kewajiban hadir fisik di lokasi apel pagi
                (Senin/Rabu/tanggal 17) — bukan cuti. Anda tetap wajib melakukan absen masuk & pulang
                seperti biasa (dari Kantor) selama tanggal yang diajukan, dan wajib disetujui pimpinan
                (Inspektur/Sekretaris) atau Admin terlebih dahulu.
              </p>
              <label className="label mt-3">Kategori Alasan</label>
              <select
                required
                className="input"
                value={form.apel_exemption_reason}
                onChange={(e) => update("apel_exemption_reason", e.target.value as ApelExemptionReason)}
              >
                <option value="">Pilih kategori...</option>
                {(Object.keys(APEL_EXEMPTION_REASON_LABEL) as ApelExemptionReason[]).map((r) => (
                  <option key={r} value={r}>
                    {APEL_EXEMPTION_REASON_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label">{isPerjadin ? "Uraian Tugas" : isApelExemption ? "Penjelasan Kondisi" : "Alasan"}</label>
            <textarea
              required
              className="input"
              rows={3}
              value={form.reason}
              onChange={(e) => update("reason", e.target.value)}
              placeholder={
                isPerjadin
                  ? "Jelaskan uraian/keperluan tugas dinas secara singkat"
                  : isApelExemption
                    ? "Jelaskan kondisi Anda, mis. tidak dapat berdiri lama karena sakit/hamil"
                    : "Jelaskan alasan cuti/izin/sakit secara singkat"
              }
            />
          </div>

          <div>
            <label className="label">
              {isPerjadin
                ? "Lampiran (opsional — mis. scan Surat Tugas/SPT)"
                : isApelExemption
                  ? "Lampiran (opsional — mis. surat keterangan dokter/bidan)"
                  : "Lampiran (opsional — mis. surat dokter)"}
            </label>
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
        <p className="text-sm text-slate-500">Belum ada pengajuan cuti/izin/perjalanan dinas.</p>
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-800">
                    {LEAVE_TYPE_LABEL[r.type]} · {r.start_date} s/d {r.end_date}
                  </p>
                  {r.destination && (
                    <p className="text-sm text-slate-600">
                      Tujuan: <span className="font-medium">{r.destination}</span>
                      {r.letter_number ? ` · No. Surat: ${r.letter_number}` : ""}
                    </p>
                  )}
                  {r.apel_exemption_reason && (
                    <p className="text-sm text-slate-600">
                      Kategori:{" "}
                      <span className="font-medium">
                        {APEL_EXEMPTION_REASON_LABEL[r.apel_exemption_reason as ApelExemptionReason]}
                      </span>
                    </p>
                  )}
                  <p className="text-sm text-slate-500">{r.reason}</p>
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

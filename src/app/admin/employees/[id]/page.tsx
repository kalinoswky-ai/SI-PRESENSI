"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import FaceCamera, { FaceCaptureResult } from "@/components/FaceCamera";
import type { Employee } from "@/types";
import { CheckCircle2, ScanFace, Clock, XCircle } from "lucide-react";
import DeleteEmployeeButton from "../DeleteEmployeeButton";

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reEnrolling, setReEnrolling] = useState(false);
  const [newCapture, setNewCapture] = useState<FaceCaptureResult | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: me } = await supabase.auth.getUser();
      setSelfId(me.user?.id ?? null);
      const { data } = await supabase.from("employees").select("*").eq("id", params.id).single();
      setEmployee(data as Employee);
      setLoading(false);
    }
    load();
  }, [params.id, supabase]);

  async function patch(fields: Partial<Employee>) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/employees/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Gagal menyimpan.");
    } else {
      setEmployee((prev) => (prev ? { ...prev, ...fields } : prev));
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    }
    setSaving(false);
  }

  async function handleFaceReEnroll() {
    if (!newCapture) return;
    setSaving(true);
    const formData = new FormData();
    formData.append("descriptor", JSON.stringify(newCapture.descriptor));
    formData.append("photo", newCapture.imageBlob, "photo.jpg");

    const res = await fetch(`/api/employees/${params.id}/face`, { method: "POST", body: formData });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Gagal mendaftarkan ulang wajah.");
    } else {
      setReEnrolling(false);
      setNewCapture(null);
      router.refresh();
      const { data } = await supabase.from("employees").select("*").eq("id", params.id).single();
      setEmployee(data as Employee);
    }
    setSaving(false);
  }

  async function handleFaceReview(action: "approve" | "reject") {
    setReviewing(true);
    setError(null);
    const res = await fetch(`/api/employees/${params.id}/face-enroll/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason: action === "reject" ? rejectReason || null : undefined }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Gagal memproses verifikasi wajah.");
    } else {
      setShowRejectBox(false);
      setRejectReason("");
      const { data } = await supabase.from("employees").select("*").eq("id", params.id).single();
      setEmployee(data as Employee);
    }
    setReviewing(false);
  }

  if (loading) return <p className="text-center text-sm text-slate-500">Memuat...</p>;
  if (!employee) return <p className="text-center text-sm text-slate-500">Pegawai tidak ditemukan.</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-lg font-bold text-slate-900">Kelola Pegawai</h1>

      <div className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Nama Lengkap</label>
            <input
              className="input"
              defaultValue={employee.full_name}
              onBlur={(e) => e.target.value !== employee.full_name && patch({ full_name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">
              NIP {employee.role === "admin" && <span className="text-slate-400">(opsional untuk Admin)</span>}
            </label>
            <input
              className="input"
              defaultValue={employee.nip ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (employee.nip ?? "")) patch({ nip: v || null });
              }}
            />
          </div>
          <div>
            <label className="label">Jabatan</label>
            <input
              className="input"
              defaultValue={employee.position ?? ""}
              onBlur={(e) => e.target.value !== employee.position && patch({ position: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Email (untuk login)</label>
            <input
              type="email"
              className="input"
              defaultValue={employee.email}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== employee.email) patch({ email: v });
              }}
              placeholder="nama@contoh.go.id"
            />
            <p className="mt-1 text-xs text-slate-400">
              Ini email untuk pegawai login, bukan sekadar catatan. Ubah di sini langsung berlaku —
              tidak perlu hapus &amp; daftarkan ulang akunnya.
            </p>
          </div>
          <div>
            <label className="label">No. WhatsApp</label>
            <input
              type="tel"
              className="input"
              defaultValue={employee.phone ?? ""}
              onBlur={(e) => e.target.value !== employee.phone && patch({ phone: e.target.value })}
              placeholder="62812xxxxxxx"
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select
              className="input"
              value={employee.role}
              onChange={(e) => patch({ role: e.target.value as Employee["role"] })}
            >
              <option value="employee">Pegawai</option>
              <option value="pimpinan">Pimpinan (lihat statistik semua pegawai)</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="label">Kelompok Apel Rabu (OPD)</label>
            <input
              className="input"
              defaultValue={employee.apel_group ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (employee.apel_group ?? "")) patch({ apel_group: v || null });
              }}
              placeholder="mis. Inspektorat, Sekretariat Daerah, dst."
            />
            <p className="mt-1 text-xs text-slate-400">
              Menentukan lokasi apel Rabu mana yang berlaku bagi pegawai ini (dikelola di Pengaturan
              &gt; Lokasi Apel). Apel Senin berlaku untuk semua pegawai, tidak perlu diisi di sini.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <div>
            <p className="text-sm font-medium text-slate-800">Status Akun</p>
            <p className="text-sm text-slate-500">
              {employee.is_active ? "Aktif — dapat melakukan absensi" : "Nonaktif — tidak dapat login/absen"}
            </p>
          </div>
          <button
            onClick={() => patch({ is_active: !employee.is_active })}
            disabled={saving}
            className={employee.is_active ? "btn-secondary" : "btn-primary"}
          >
            {employee.is_active ? "Nonaktifkan" : "Aktifkan"}
          </button>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {savedMsg && (
          <p className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 size={15} /> Perubahan tersimpan.
          </p>
        )}
        <p className="text-xs text-slate-400">
          Ubah isian lalu klik di luar kolom — perubahan tersimpan otomatis dan tercatat di Riwayat
          Perubahan.
        </p>
      </div>

      {employee.face_enrollment_status === "pending" && employee.pending_photo_url && (
        <div className="card space-y-4 border-amber-200 bg-amber-50/40">
          <div className="flex items-center gap-2">
            <Clock className="text-amber-600" size={20} />
            <p className="font-semibold text-slate-800">Menunggu Verifikasi Wajah dari Pegawai</p>
          </div>
          <p className="text-sm text-slate-600">
            Pegawai telah merekam wajahnya sendiri dan menunggu persetujuan Anda. Periksa foto di
            bawah ini sebelum menyetujui.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={employee.pending_photo_url}
            alt="Foto wajah menunggu persetujuan"
            className="mx-auto h-56 w-56 rounded-lg border border-slate-200 object-cover"
          />

          {!showRejectBox ? (
            <div className="flex gap-2">
              <button
                onClick={() => setShowRejectBox(true)}
                disabled={reviewing}
                className="btn-secondary flex-1"
              >
                Tolak
              </button>
              <button
                onClick={() => handleFaceReview("approve")}
                disabled={reviewing}
                className="btn-primary flex-1"
              >
                {reviewing ? "Memproses..." : "Setujui"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="label">Alasan penolakan (opsional, akan dilihat pegawai)</label>
              <input
                className="input"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Contoh: Foto buram, wajah tidak jelas terlihat"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRejectBox(false)}
                  disabled={reviewing}
                  className="btn-secondary flex-1"
                >
                  Batal
                </button>
                <button
                  onClick={() => handleFaceReview("reject")}
                  disabled={reviewing}
                  className="btn-primary flex-1 bg-red-600 hover:bg-red-700"
                >
                  {reviewing ? "Memproses..." : "Konfirmasi Tolak"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800">Data Wajah (Face Recognition)</p>
            <p className="text-sm text-slate-500">
              {employee.face_enrollment_status === "approved" && "Wajah sudah terdaftar & disetujui."}
              {employee.face_enrollment_status === "pending" && "Menunggu persetujuan (lihat kotak di atas)."}
              {employee.face_enrollment_status === "rejected" && "Pendaftaran terakhir ditolak."}
              {employee.face_enrollment_status === "none" && "Pegawai belum merekam wajah sendiri."}
            </p>
          </div>
          {employee.face_descriptor ? (
            <ScanFace className="text-emerald-500" size={22} />
          ) : employee.face_enrollment_status === "rejected" ? (
            <XCircle className="text-red-500" size={22} />
          ) : (
            <ScanFace className="text-amber-500" size={22} />
          )}
        </div>

        <p className="text-xs text-slate-400">
          Normalnya pegawai mendaftarkan wajahnya sendiri lewat menu &quot;Wajah Saya&quot; di akun
          mereka. Tombol di bawah ini hanya untuk kondisi darurat (mis. Admin mendampingi pegawai
          langsung di kantor).
        </p>

        {!reEnrolling ? (
          <button onClick={() => setReEnrolling(true)} className="btn-secondary">
            Rekam Wajah Langsung (oleh Admin)
          </button>
        ) : (
          <div className="space-y-3">
            {newCapture ? (
              <p className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 size={16} /> Wajah baru berhasil terekam.
              </p>
            ) : (
              <FaceCamera onCapture={setNewCapture} captureLabel="Rekam Ulang Wajah" />
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setReEnrolling(false);
                  setNewCapture(null);
                }}
                className="btn-secondary"
              >
                Batal
              </button>
              <button onClick={handleFaceReEnroll} disabled={!newCapture || saving} className="btn-primary">
                Simpan Wajah Baru
              </button>
            </div>
          </div>
        )}
      </div>

      {employee.id !== selfId && (
        <div className="card space-y-3 border-red-200">
          <div>
            <p className="text-sm font-semibold text-red-700">Zona Berbahaya</p>
            <p className="text-sm text-slate-500">
              Hapus pegawai ini beserta seluruh data absensi, pengajuan cuti/izin, dan fotonya secara
              permanen. Untuk pegawai yang pindah tugas/pensiun, lebih aman gunakan tombol{" "}
              <strong>Nonaktifkan</strong> di atas.
            </p>
          </div>
          <DeleteEmployeeButton id={employee.id} name={employee.full_name} redirectTo="/admin/employees" />
        </div>
      )}
    </div>
  );
}

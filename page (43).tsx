"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import FaceCamera, { FaceCaptureResult } from "@/components/FaceCamera";
import type { Employee } from "@/types";
import { CheckCircle2, Clock, XCircle, ScanFace } from "lucide-react";

export default function FaceEnrollmentPage() {
  const supabase = createClient();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [capture, setCapture] = useState<FaceCaptureResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data } = await supabase.from("employees").select("*").eq("id", userData.user.id).single();
    setEmployee(data as Employee);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    if (!capture || !employee) return;
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append("descriptor", JSON.stringify(capture.descriptor));
    formData.append("photo", capture.imageBlob, "photo.jpg");

    try {
      const res = await fetch(`/api/employees/${employee.id}/face-enroll`, { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Gagal mengirim data wajah.");
      } else {
        setSuccess(true);
        setCapture(null);
        await load();
      }
    } catch {
      setError("Terjadi kesalahan koneksi.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !employee) return <p className="text-center text-sm text-slate-500">Memuat...</p>;

  const status = employee.face_enrollment_status;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Wajah Saya</h1>
        <p className="text-sm text-slate-500">
          Rekam wajah Anda sendiri di sini untuk didaftarkan sebagai data pembanding saat absen.
          Admin akan memverifikasi sebelum data ini aktif dipakai.
        </p>
      </div>

      {/* Status saat ini */}
      <div className="card space-y-3">
        {status === "approved" && (
          <div className="flex items-center gap-3 rounded-lg bg-emerald-50 p-3 text-emerald-700">
            <CheckCircle2 size={22} className="shrink-0" />
            <p className="text-sm">
              Wajah Anda sudah terdaftar dan <strong>disetujui Admin</strong>. Anda bisa melakukan
              absensi.
            </p>
          </div>
        )}
        {status === "pending" && (
          <div className="flex items-center gap-3 rounded-lg bg-amber-50 p-3 text-amber-700">
            <Clock size={22} className="shrink-0" />
            <p className="text-sm">
              Pendaftaran wajah Anda sedang <strong>menunggu persetujuan Admin</strong>. Anda belum
              bisa absen sampai disetujui.
            </p>
          </div>
        )}
        {status === "rejected" && (
          <div className="flex items-start gap-3 rounded-lg bg-red-50 p-3 text-red-700">
            <XCircle size={22} className="mt-0.5 shrink-0" />
            <div className="text-sm">
              <p>
                Pendaftaran wajah Anda <strong>ditolak Admin</strong>
                {employee.face_rejection_reason ? `: ${employee.face_rejection_reason}` : "."}
              </p>
              <p className="mt-1">Silakan rekam ulang wajah Anda dengan foto yang lebih jelas.</p>
            </div>
          </div>
        )}
        {status === "none" && (
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 text-slate-600">
            <ScanFace size={22} className="shrink-0" />
            <p className="text-sm">Anda belum mendaftarkan wajah. Silakan rekam wajah di bawah ini.</p>
          </div>
        )}
      </div>

      {/* Form rekam wajah — selalu tersedia agar bisa daftar ulang kapan saja */}
      {status !== "pending" && (
        <div className="card space-y-4">
          <p className="font-semibold text-slate-800">
            {status === "approved" ? "Daftarkan Ulang Wajah" : "Rekam Wajah"}
          </p>
          <p className="text-sm text-slate-500">
            Pastikan pencahayaan cukup dan wajah terlihat jelas menghadap kamera.
          </p>

          {success && (
            <p className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 size={16} /> Berhasil dikirim, menunggu persetujuan Admin.
            </p>
          )}

          {capture ? (
            <p className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 size={16} /> Wajah berhasil terekam. Klik &quot;Kirim untuk Disetujui&quot; di bawah.
            </p>
          ) : (
            <FaceCamera onCapture={setCapture} captureLabel="Rekam Wajah" />
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={!capture || submitting}
            className="btn-primary w-full"
          >
            {submitting ? "Mengirim..." : "Kirim untuk Disetujui"}
          </button>
        </div>
      )}
    </div>
  );
}

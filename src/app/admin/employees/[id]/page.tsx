"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import FaceCamera, { FaceCaptureResult } from "@/components/FaceCamera";
import type { Employee } from "@/types";
import { CheckCircle2, ScanFace } from "lucide-react";

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

  useEffect(() => {
    async function load() {
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
              <option value="admin">Admin</option>
            </select>
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
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800">Data Wajah (Face Recognition)</p>
            <p className="text-sm text-slate-500">
              {employee.face_descriptor ? "Wajah sudah terdaftar." : "Wajah belum terdaftar."}
            </p>
          </div>
          {employee.face_descriptor ? (
            <ScanFace className="text-emerald-500" size={22} />
          ) : (
            <ScanFace className="text-amber-500" size={22} />
          )}
        </div>

        {!reEnrolling ? (
          <button onClick={() => setReEnrolling(true)} className="btn-secondary">
            Daftarkan Ulang Wajah
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
    </div>
  );
}

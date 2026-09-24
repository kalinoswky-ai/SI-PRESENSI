"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScanFace } from "lucide-react";

export default function NewEmployeePage() {
  const router = useRouter();

  const [form, setForm] = useState({
    nip: "",
    full_name: "",
    position: "",
    email: "",
    phone: "",
    password: "",
    role: "employee",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData();
    Object.entries(form).forEach(([k, v]) => formData.append(k, v));

    try {
      const res = await fetch("/api/employees/create", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Gagal menyimpan pegawai.");
        setLoading(false);
        return;
      }
      router.push("/admin/employees");
      router.refresh();
    } catch {
      setError("Terjadi kesalahan koneksi.");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-lg font-bold text-slate-900">Tambah Pegawai Baru</h1>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">
              NIP {form.role === "admin" && <span className="text-slate-400">(opsional untuk Admin)</span>}
            </label>
            <input
              required={form.role !== "admin"}
              className="input"
              value={form.nip}
              onChange={(e) => update("nip", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Nama Lengkap</label>
            <input
              required
              className="input"
              value={form.full_name}
              onChange={(e) => update("full_name", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Jabatan</label>
            <input
              className="input"
              value={form.position}
              onChange={(e) => update("position", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select
              className="input"
              value={form.role}
              onChange={(e) => update("role", e.target.value)}
            >
              <option value="employee">Pegawai</option>
              <option value="pimpinan">Pimpinan (lihat statistik semua pegawai)</option>
              <option value="admin">Admin</option>
            </select>
            {form.role === "pimpinan" && (
              <p className="mt-1 text-xs text-slate-400">
                Contoh Jabatan: <strong>Inspektur</strong> atau <strong>Sekretaris Inspektorat</strong>. Akun ini
                tetap absen sendiri lewat Dashboard, ditambah akses lihat Timesheets, Reports, dan status Cuti/Izin
                seluruh pegawai lewat menu Admin (tanpa bisa menambah/mengedit/menghapus data).
              </p>
            )}
          </div>
          <div>
            <label className="label">Email</label>
            <input
              required
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </div>
          <div>
            <label className="label">No. WhatsApp (opsional)</label>
            <input
              type="tel"
              className="input"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="62812xxxxxxx"
            />
            <p className="mt-1 text-xs text-slate-400">
              Dipakai untuk kirim notifikasi WhatsApp pribadi bila pegawai terlambat absen (opsional).
            </p>
          </div>
          <div>
            <label className="label">Password Awal</label>
            <input
              required
              type="text"
              minLength={6}
              className="input"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="Min. 6 karakter"
            />
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <ScanFace className="mt-0.5 shrink-0 text-slate-400" size={20} />
          <p className="text-sm text-slate-500">
            Pendaftaran wajah <strong>tidak dilakukan di sini</strong>. Setelah akun ini login
            pertama kali, pegawai merekam wajahnya sendiri lewat menu{" "}
            <strong>Dashboard &gt; Wajah Saya</strong>, lalu Admin tinggal menyetujuinya di halaman
            Kelola Pegawai sebelum pegawai bisa absen.
          </p>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Menyimpan..." : "Simpan Pegawai"}
        </button>
      </form>
    </div>
  );
}

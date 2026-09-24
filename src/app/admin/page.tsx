import { createClient } from "@/lib/supabase/server";
import { getViewerProfile } from "@/lib/admin/auth";
import { witaDateKey } from "@/lib/geo";
import { Users, CheckCircle2, AlertTriangle, Clock3 } from "lucide-react";
import Link from "next/link";

// PENTING: halaman admin ini membaca data langsung dari Supabase pada setiap request.
// Tanpa baris ini, Next.js App Router bisa meng-cache hasil fetch server-side, sehingga
// data baru (mis. pengajuan cuti/izin/sakit pegawai) tidak langsung muncul di sisi Admin
// walaupun sudah benar-benar tersimpan di database.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOverviewPage() {
  const supabase = createClient();
  const viewer = await getViewerProfile();
  const isPimpinan = viewer?.role === "pimpinan";

  // Awal hari menurut WITA (server Vercel berjalan di UTC — tanpa ini absen pukul 07.00–08.00 WITA
  // tidak terhitung pada kartu "Absen Masuk Hari Ini").
  const startOfDayIso = `${witaDateKey(new Date())}T00:00:00+08:00`;

  const [{ count: totalEmployees }, { count: activeEmployees }, { data: todayAttendance }, { count: pendingLeave }] =
    await Promise.all([
      supabase.from("employees").select("*", { count: "exact", head: true }),
      supabase.from("employees").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabase
        .from("attendance")
        .select("id, type, status, is_late, employee_id")
        .gte("server_time", startOfDayIso),
      supabase.from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    ]);

  const todayIn = (todayAttendance ?? []).filter((r) => r.type === "in" && r.status === "valid");
  const todayLate = todayIn.filter((r) => r.is_late);
  const todayRejected = (todayAttendance ?? []).filter((r) => r.status === "rejected");

  const stats = [
    { label: "Total Pegawai", value: totalEmployees ?? 0, icon: Users, color: "text-brand-600" },
    { label: "Pegawai Aktif", value: activeEmployees ?? 0, icon: CheckCircle2, color: "text-emerald-600" },
    { label: "Absen Masuk Hari Ini", value: todayIn.length, icon: Clock3, color: "text-slate-600" },
    { label: "Terlambat Hari Ini", value: todayLate.length, icon: AlertTriangle, color: "text-amber-600" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Ringkasan Absensi</h1>
        {isPimpinan && (
          <p className="text-sm text-slate-500">
            Statistik kehadiran seluruh pegawai Inspektorat — Anda login sebagai{" "}
            <strong>{viewer?.position || "Pimpinan"}</strong> (mode lihat saja).
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <s.icon className={s.color} size={22} />
            <p className="mt-3 text-2xl font-bold text-slate-900">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {todayRejected.length > 0 && (
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-sm font-medium text-amber-800">
            {todayRejected.length} percobaan absensi ditolak hari ini (lokasi/wajah tidak sesuai).
          </p>
          <Link href="/admin/attendance/log" className="text-sm font-medium text-amber-700 underline">
            Lihat detail di Timesheets → Log Absensi →
          </Link>
        </div>
      )}

      {(pendingLeave ?? 0) > 0 && (
        <div className="card border-brand-200 bg-brand-50">
          <p className="text-sm font-medium text-brand-800">
            {pendingLeave} pengajuan cuti/izin {isPimpinan ? "sedang menunggu diproses Admin." : "menunggu persetujuan Anda."}
          </p>
          <Link href="/admin/leave" className="text-sm font-medium text-brand-700 underline">
            {isPimpinan ? "Lihat daftar pengajuan →" : "Tinjau pengajuan →"}
          </Link>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {!isPimpinan && (
          <Link href="/admin/employees/new" className="card block hover:border-brand-300">
            <p className="font-semibold text-slate-800">+ Tambah Pegawai Baru</p>
            <p className="text-sm text-slate-500">Daftarkan akun & wajah pegawai baru.</p>
          </Link>
        )}
        <Link href="/admin/attendance" className="card block hover:border-brand-300">
          <p className="font-semibold text-slate-800">⏱️ Timesheets (Absensi)</p>
          <p className="text-sm text-slate-500">Rekap jam kerja mingguan per pegawai & log mentah tiap absen.</p>
        </Link>
        <Link href="/admin/reports" className="card block hover:border-brand-300">
          <p className="font-semibold text-slate-800">📊 Reports (Laporan) & Export Excel</p>
          <p className="text-sm text-slate-500">Rekap kehadiran per pegawai & unduh laporan untuk BKPSDM.</p>
        </Link>
        <Link href="/admin/leave" className="card block hover:border-brand-300">
          <p className="font-semibold text-slate-800">🗓️ {isPimpinan ? "Cuti/Izin Pegawai" : "Kelola Cuti/Izin"}</p>
          <p className="text-sm text-slate-500">
            {isPimpinan
              ? "Lihat status pengajuan cuti, izin, dan sakit pegawai."
              : "Setujui/tolak pengajuan cuti, izin, dan sakit pegawai."}
          </p>
        </Link>
        {!isPimpinan && (
          <Link href="/admin/settings" className="card block hover:border-brand-300">
            <p className="font-semibold text-slate-800">🔔 Notifikasi & Integrasi</p>
            <p className="text-sm text-slate-500">Atur notifikasi WA/Telegram & laporan otomatis BKPSDM.</p>
          </Link>
        )}
        {!isPimpinan && (
          <Link href="/admin/employees" className="card block hover:border-brand-300">
            <p className="font-semibold text-slate-800">👥 Data Pegawai</p>
            <p className="text-sm text-slate-500">Kelola akun, role, dan status aktif pegawai.</p>
          </Link>
        )}
      </div>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { Users, CheckCircle2, AlertTriangle, Clock3 } from "lucide-react";
import Link from "next/link";

export default async function AdminOverviewPage() {
  const supabase = createClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [{ count: totalEmployees }, { count: activeEmployees }, { data: todayAttendance }, { count: pendingLeave }] =
    await Promise.all([
      supabase.from("employees").select("*", { count: "exact", head: true }),
      supabase.from("employees").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabase
        .from("attendance")
        .select("id, type, status, is_late, employee_id")
        .gte("server_time", startOfDay.toISOString()),
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
      <h1 className="text-lg font-bold text-slate-900">Ringkasan Absensi</h1>

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
            {pendingLeave} pengajuan cuti/izin menunggu persetujuan Anda.
          </p>
          <Link href="/admin/leave" className="text-sm font-medium text-brand-700 underline">
            Tinjau pengajuan →
          </Link>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/admin/employees/new" className="card block hover:border-brand-300">
          <p className="font-semibold text-slate-800">+ Tambah Pegawai Baru</p>
          <p className="text-sm text-slate-500">Daftarkan akun & wajah pegawai baru.</p>
        </Link>
        <Link href="/admin/attendance" className="card block hover:border-brand-300">
          <p className="font-semibold text-slate-800">⏱️ Timesheets (Absensi)</p>
          <p className="text-sm text-slate-500">Rekap jam kerja mingguan per pegawai & log mentah tiap absen.</p>
        </Link>
        <Link href="/admin/reports" className="card block hover:border-brand-300">
          <p className="font-semibold text-slate-800">📊 Reports (Laporan) & Export Excel</p>
          <p className="text-sm text-slate-500">Rekap kehadiran per pegawai & unduh laporan untuk BKPSDM.</p>
        </Link>
        <Link href="/admin/leave" className="card block hover:border-brand-300">
          <p className="font-semibold text-slate-800">🗓️ Kelola Cuti/Izin</p>
          <p className="text-sm text-slate-500">Setujui/tolak pengajuan cuti, izin, dan sakit pegawai.</p>
        </Link>
        <Link href="/admin/settings" className="card block hover:border-brand-300">
          <p className="font-semibold text-slate-800">🔔 Notifikasi & Integrasi</p>
          <p className="text-sm text-slate-500">Atur notifikasi WA/Telegram & laporan otomatis BKPSDM.</p>
        </Link>
      </div>
    </div>
  );
}

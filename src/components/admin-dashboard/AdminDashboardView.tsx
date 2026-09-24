import Link from "next/link";
import {
  Users,
  UserCheck,
  LogIn,
  AlertTriangle,
  UserPlus,
  Clock,
  BarChart3,
  Briefcase,
  Bell,
  ChevronRight,
  ShieldAlert,
  Inbox,
} from "lucide-react";
import { AttendanceDonut, AttendanceTrend, STATUS_COLORS } from "./Charts";
import type { AdminDashboardData, ActivityTone } from "./types";

const TIME = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Makassar",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const TONE_DOT: Record<ActivityTone, string> = {
  ok: "bg-teal-500",
  warn: "bg-amber-500",
  bad: "bg-rose-500",
  info: "bg-brand-500",
};

const TONE_BADGE: Record<ActivityTone, string> = {
  ok: "bg-teal-50 text-teal-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-rose-50 text-rose-700",
  info: "bg-brand-50 text-brand-700",
};

/**
 * Tampilan Dashboard Admin (/admin). Semua angka berasal dari props (query Supabase di page.tsx);
 * komponen ini hanya menyajikan. Seluruh gaya di-scope oleh kelas `.admin-dashboard`.
 */
export default function AdminDashboardView({ data }: { data: AdminDashboardData }) {
  const { isPimpinan, canApproveLeave, breakdown: b } = data;
  const trendHasData = data.trend.some((d) => d.onTime + d.late > 0);

  const stats = [
    { label: "Total Pegawai", value: data.totalEmployees, icon: Users, chip: "bg-brand-50 text-brand-600" },
    { label: "Pegawai Aktif", value: data.activeEmployees, icon: UserCheck, chip: "bg-teal-50 text-teal-600" },
    { label: "Absen Masuk Hari Ini", value: data.todayInCount, icon: LogIn, chip: "bg-slate-100 text-slate-600" },
    { label: "Terlambat Hari Ini", value: data.todayLateCount, icon: AlertTriangle, chip: "bg-amber-50 text-amber-600" },
  ];

  const legend = [
    { label: "Tepat waktu", value: b.onTime, color: STATUS_COLORS.onTime },
    { label: "Terlambat", value: b.late, color: STATUS_COLORS.late },
    { label: "Cuti/izin/sakit", value: b.onLeave, color: STATUS_COLORS.onLeave },
    { label: "Belum absen", value: b.notYet, color: STATUS_COLORS.notYet },
  ];

  // Semua tujuan adalah route yang sudah ada; item khusus Admin tetap disembunyikan untuk Pimpinan.
  const actions = [
    ...(!isPimpinan
      ? [{ href: "/admin/employees/new", label: "Tambah Pegawai", hint: "Daftarkan akun & wajah baru", icon: UserPlus }]
      : []),
    { href: "/admin/attendance", label: "Timesheets", hint: "Rekap jam kerja & log absen", icon: Clock },
    { href: "/admin/reports", label: "Reports", hint: "Rekap kehadiran & ekspor BKPSDM", icon: BarChart3 },
    {
      href: "/admin/leave",
      label: canApproveLeave ? "Setujui Cuti/Izin" : "Cuti/Izin Pegawai",
      hint: canApproveLeave ? "Setujui atau tolak pengajuan" : "Lihat status pengajuan (persetujuan oleh Inspektur)",
      icon: Briefcase,
    },
    ...(!isPimpinan
      ? [
          { href: "/admin/settings", label: "Notifikasi & Integrasi", hint: "WhatsApp, Telegram, BKPSDM", icon: Bell },
          { href: "/admin/employees", label: "Data Pegawai", hint: "Akun, role, status aktif", icon: Users },
        ]
      : []),
  ];

  const hasAttention = data.todayRejectedCount > 0 || data.pendingLeaveCount > 0;

  return (
    <div className="admin-dashboard space-y-5">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Ringkasan Absensi</h1>
          {data.adminName && (
            <p className="text-sm text-slate-600">Selamat datang kembali, {data.adminName}</p>
          )}
          {isPimpinan && (
            <p className="mt-0.5 text-sm text-slate-500">
              Statistik kehadiran seluruh pegawai Inspektorat — Anda login sebagai{" "}
              <strong>{data.positionLabel || "Pimpinan"}</strong>{" "}
              {canApproveLeave ? "(lihat statistik; berwenang menyetujui cuti/izin/sakit)." : "(mode lihat saja)."}
            </p>
          )}
        </div>
        <p className="text-sm font-medium text-slate-500">{data.todayLabel}</p>
      </header>

      {/* Baris 1: komposisi kehadiran hari ini + angka utama */}
      <div className="grid gap-4 lg:grid-cols-12">
        <section className="ad-panel ad-hero p-5 lg:col-span-7" aria-labelledby="ad-today">
          <h2 id="ad-today" className="text-sm font-semibold text-slate-800">
            Status Kehadiran Hari Ini
          </h2>
          <p className="text-xs text-slate-500">
            Dari {b.eligible} pegawai wajib absen (aktif, di luar akun Admin)
          </p>
          <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
            <AttendanceDonut data={b} />
            <ul className="w-full flex-1 divide-y divide-slate-200/70">
              {legend.map((l) => (
                <li key={l.label} className="flex items-center justify-between py-2 text-sm">
                  <span className="flex items-center gap-2.5 text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                    {l.label}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">{l.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 lg:col-span-5">
          {stats.map((s) => (
            <div key={s.label} className="ad-panel flex flex-col justify-between p-4">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.chip}`}>
                <s.icon size={18} />
              </span>
              <div className="mt-4">
                <p className="text-2xl font-bold tabular-nums text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Baris 2: tren + perlu ditinjau & akses cepat */}
      <div className="grid gap-4 lg:grid-cols-12">
        <section className="ad-panel p-5 lg:col-span-7" aria-labelledby="ad-trend">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="ad-trend" className="text-sm font-semibold text-slate-800">
                Tren Kehadiran
              </h2>
              <p className="text-xs text-slate-500">Pegawai yang absen masuk (valid), 7 hari terakhir</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STATUS_COLORS.onTime }} />
                Tepat waktu
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STATUS_COLORS.late }} />
                Terlambat
              </span>
            </div>
          </div>
          <div className="mt-3">
            <AttendanceTrend days={data.trend} />
            {!trendHasData && (
              <p className="mt-1 text-center text-xs text-slate-500">
                Belum ada absensi masuk yang tercatat dalam 7 hari terakhir.
              </p>
            )}
          </div>
        </section>

        <div className="space-y-4 lg:col-span-5">
          <section className="ad-panel p-5" aria-labelledby="ad-attention">
            <h2 id="ad-attention" className="text-sm font-semibold text-slate-800">
              Perlu Ditinjau
            </h2>
            {hasAttention ? (
              <ul className="mt-3 space-y-2">
                {data.todayRejectedCount > 0 && (
                  <li>
                    <Link href="/admin/attendance/log" className="ad-row border-amber-200/80 bg-amber-50/80">
                      <ShieldAlert size={18} className="shrink-0 text-amber-600" />
                      <span className="flex-1 text-sm text-amber-900">
                        {data.todayRejectedCount} percobaan absensi ditolak hari ini (lokasi/wajah tidak sesuai)
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-amber-500" />
                    </Link>
                  </li>
                )}
                {data.pendingLeaveCount > 0 && (
                  <li>
                    <Link href="/admin/leave" className="ad-row border-brand-100 bg-brand-50/80">
                      <Briefcase size={18} className="shrink-0 text-brand-600" />
                      <span className="flex-1 text-sm text-brand-900">
                        {data.pendingLeaveCount} pengajuan cuti/izin{" "}
                        {canApproveLeave ? "menunggu persetujuan Anda" : "menunggu persetujuan Inspektur"}
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-brand-500" />
                    </Link>
                  </li>
                )}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Tidak ada absensi ditolak maupun pengajuan yang menunggu. Semua beres.
              </p>
            )}
          </section>

          <section className="ad-panel p-2" aria-label="Akses cepat">
            <ul>
              {actions.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className="ad-action">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/80 text-brand-600 shadow-sm">
                      <a.icon size={16} />
                    </span>
                    <span className="flex-1 leading-tight">
                      <span className="block text-sm font-medium text-slate-800">{a.label}</span>
                      <span className="block text-xs text-slate-500">{a.hint}</span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* Baris 3: aktivitas terbaru */}
      <section className="ad-panel p-5" aria-labelledby="ad-activity">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="ad-activity" className="text-sm font-semibold text-slate-800">
            Aktivitas Terbaru
          </h2>
          <p className="text-xs text-slate-500">Waktu dalam WITA</p>
        </div>
        {data.activities.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300/80 py-8 text-center">
            <Inbox size={22} className="text-slate-400" />
            <p className="text-sm font-medium text-slate-700">Belum ada aktivitas</p>
            <p className="max-w-xs text-xs text-slate-500">
              Absensi dan pengajuan cuti/izin pegawai akan muncul di sini begitu tercatat.
            </p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200/70">
            {data.activities.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[a.tone]}`} />
                <p className="min-w-0 flex-1 truncate text-sm text-slate-700">
                  <span className="font-medium text-slate-900">{a.name}</span> {a.text}
                </p>
                {a.badge && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_BADGE[a.tone]}`}>
                    {a.badge}
                  </span>
                )}
                <time dateTime={a.at} className="shrink-0 text-xs tabular-nums text-slate-400">
                  {TIME.format(new Date(a.at))}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

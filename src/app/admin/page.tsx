import { createClient } from "@/lib/supabase/server";
import { getViewerProfile, getLeaveApprover } from "@/lib/admin/auth";
import { witaDateKey } from "@/lib/geo";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { LEAVE_TYPE_LABEL, type LeaveStatus, type LeaveType } from "@/types";
import AdminDashboardView from "@/components/admin-dashboard/AdminDashboardView";
import type { ActivityItem, AdminDashboardData, TrendDay } from "@/components/admin-dashboard/types";

// PENTING: halaman admin ini membaca data langsung dari Supabase pada setiap request.
// Tanpa baris ini, Next.js App Router bisa meng-cache hasil fetch server-side, sehingga
// data baru (mis. pengajuan cuti/izin/sakit pegawai) tidak langsung muncul di sisi Admin
// walaupun sudah benar-benar tersimpan di database.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
};

const TODAY_FMT = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Makassar",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function AdminOverviewPage() {
  const supabase = createClient();
  const viewer = await getViewerProfile();
  const isPimpinan = viewer?.role === "pimpinan";
  const canApproveLeave = (await getLeaveApprover()) !== null;

  // Awal hari menurut WITA (server Vercel berjalan di UTC — tanpa ini absen pukul 07.00–08.00 WITA
  // tidak terhitung pada kartu "Absen Masuk Hari Ini").
  const now = new Date();
  const todayKey = witaDateKey(now);
  const startOfDayIso = `${todayKey}T00:00:00+08:00`;

  // 7 hari terakhir (termasuk hari ini) menurut WITA, untuk grafik tren.
  const dayStart = new Date(startOfDayIso).getTime();
  const dayKeys = Array.from({ length: 7 }, (_, i) => witaDateKey(new Date(dayStart - (6 - i) * 86400000)));
  const trendStartIso = `${dayKeys[0]}T00:00:00+08:00`;

  const [
    { count: totalEmployees },
    { count: activeEmployees },
    { count: eligibleEmployees },
    { data: todayAttendance },
    { count: pendingLeave },
    { data: leaveToday },
    trendRows,
    { data: recentAttendance },
    { data: recentLeave },
  ] = await Promise.all([
    supabase.from("employees").select("*", { count: "exact", head: true }),
    supabase.from("employees").select("*", { count: "exact", head: true }).eq("is_active", true),
    // Pegawai wajib absen: aktif & bukan akun Admin (Admin tidak absen lewat /dashboard).
    supabase.from("employees").select("*", { count: "exact", head: true }).eq("is_active", true).neq("role", "admin"),
    supabase
      .from("attendance")
      .select("id, type, status, is_late, employee_id")
      .gte("server_time", startOfDayIso),
    supabase.from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    // Cuti/izin/sakit/perjalanan dinas yang sudah disetujui dan mencakup hari ini.
    supabase
      .from("leave_requests")
      .select("employee_id, type")
      .eq("status", "approved")
      .lte("start_date", todayKey)
      .gte("end_date", todayKey),
    fetchAllRows<{ employee_id: string; server_time: string; is_late: boolean }>((from, to) =>
      supabase
        .from("attendance")
        .select("id, employee_id, server_time, is_late")
        .eq("type", "in")
        .eq("status", "valid")
        .gte("server_time", trendStartIso)
        .order("server_time", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    supabase
      .from("attendance")
      .select("id, employee_id, type, status, is_late, server_time")
      .order("server_time", { ascending: false })
      .limit(8),
    supabase
      .from("leave_requests")
      .select("id, employee_id, type, status, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const todayIn = (todayAttendance ?? []).filter((r) => r.type === "in" && r.status === "valid");
  const todayLate = todayIn.filter((r) => r.is_late);
  const todayRejected = (todayAttendance ?? []).filter((r) => r.status === "rejected");

  // --- Komposisi kehadiran hari ini (per pegawai, bukan per baris absen) ---
  const presentIds = new Set(todayIn.map((r) => r.employee_id as string));
  const lateIds = new Set(todayLate.map((r) => r.employee_id as string));
  // Cuti/izin/sakit/dinas disetujui hari ini, dipisah per jenis. Satu pegawai dihitung sekali
  // (jenis pertama yang ditemukan) dan tidak dihitung bila sudah absen masuk.
  const leaveByType: Record<"cuti" | "izin" | "sakit" | "dinas_dalam" | "dinas_luar", Set<string>> = {
    cuti: new Set<string>(),
    izin: new Set<string>(),
    sakit: new Set<string>(),
    dinas_dalam: new Set<string>(),
    dinas_luar: new Set<string>(),
  };
  const leaveCounted = new Set<string>();
  for (const r of leaveToday ?? []) {
    const id = r.employee_id as string;
    const type = r.type as LeaveType;
    if (presentIds.has(id) || leaveCounted.has(id) || !(type in leaveByType)) continue;
    leaveByType[type].add(id);
    leaveCounted.add(id);
  }
  const eligible = eligibleEmployees ?? 0;
  const late = lateIds.size;
  const onTime = presentIds.size - late;
  const onLeave = leaveCounted.size;
  const tanpaBerita = Math.max(0, eligible - presentIds.size - onLeave);

  // --- Tren 7 hari ---
  const perDay = new Map<string, { present: Set<string>; late: Set<string> }>(
    dayKeys.map((k) => [k, { present: new Set<string>(), late: new Set<string>() }])
  );
  for (const r of trendRows.data) {
    const bucket = perDay.get(witaDateKey(new Date(r.server_time)));
    if (!bucket) continue;
    bucket.present.add(r.employee_id);
    if (r.is_late) bucket.late.add(r.employee_id);
  }
  const trend: TrendDay[] = dayKeys.map((key) => {
    const b = perDay.get(key)!;
    return { key, onTime: b.present.size - b.late.size, late: b.late.size };
  });

  // --- Aktivitas terbaru. Nama diambil lewat query terpisah (leave_requests punya dua FK ke
  // employees, sehingga embed `employees(...)` ambigu — lihat catatan di admin/leave/page.tsx). ---
  const activityIds = Array.from(
    new Set([
      ...(recentAttendance ?? []).map((r) => r.employee_id as string),
      ...(recentLeave ?? []).map((r) => r.employee_id as string),
    ])
  );
  const nameMap = new Map<string, string>();
  if (activityIds.length > 0) {
    const { data: emps } = await supabase.from("employees").select("id, full_name").in("id", activityIds);
    (emps ?? []).forEach((e) => nameMap.set(e.id as string, e.full_name as string));
  }
  const nameOf = (id: string) => nameMap.get(id) ?? "Pegawai";

  const attendanceItems: ActivityItem[] = (recentAttendance ?? []).map((r) => {
    if (r.status === "rejected") {
      return {
        id: `att-${r.id}`,
        at: r.server_time as string,
        name: nameOf(r.employee_id as string),
        text: r.type === "in" ? "percobaan absen masuk ditolak" : "percobaan absen pulang ditolak",
        tone: "bad" as const,
        badge: "Ditolak",
      };
    }
    if (r.type === "in") {
      return {
        id: `att-${r.id}`,
        at: r.server_time as string,
        name: nameOf(r.employee_id as string),
        text: "absen masuk",
        tone: r.is_late ? ("warn" as const) : ("ok" as const),
        badge: r.is_late ? "Terlambat" : "Tepat waktu",
      };
    }
    return {
      id: `att-${r.id}`,
      at: r.server_time as string,
      name: nameOf(r.employee_id as string),
      text: "absen pulang",
      tone: "ok" as const,
    };
  });

  const leaveItems: ActivityItem[] = (recentLeave ?? []).map((r) => ({
    id: `leave-${r.id}`,
    at: r.created_at as string,
    name: nameOf(r.employee_id as string),
    text: `mengajukan ${(LEAVE_TYPE_LABEL[r.type as LeaveType] ?? "cuti/izin").toLowerCase()}`,
    tone: r.status === "approved" ? ("ok" as const) : r.status === "rejected" ? ("bad" as const) : ("info" as const),
    badge: LEAVE_STATUS_LABEL[r.status as LeaveStatus] ?? undefined,
  }));

  const activities = [...attendanceItems, ...leaveItems]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8);

  const data: AdminDashboardData = {
    adminName: viewer?.full_name ?? null,
    isPimpinan,
    canApproveLeave,
    positionLabel: viewer?.position ?? null,
    todayLabel: TODAY_FMT.format(now),
    totalEmployees: totalEmployees ?? 0,
    activeEmployees: activeEmployees ?? 0,
    todayInCount: todayIn.length,
    todayLateCount: todayLate.length,
    todayRejectedCount: todayRejected.length,
    pendingLeaveCount: pendingLeave ?? 0,
    breakdown: {
      eligible,
      onTime,
      late,
      cuti: leaveByType.cuti.size,
      izin: leaveByType.izin.size,
      sakit: leaveByType.sakit.size,
      dinasDalam: leaveByType.dinas_dalam.size,
      dinasLuar: leaveByType.dinas_luar.size,
      tanpaBerita,
    },
    trend,
    activities,
  };

  return <AdminDashboardView data={data} />;
}

import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { witaDateKey, formatDurationMinutes } from "@/lib/geo";
import { Download, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import Link from "next/link";
import AttendanceTabs from "./AttendanceTabs";
import type { AttendanceRecord } from "@/types";

// Selalu render ulang & ambil data terbaru dari Supabase — jangan di-cache Next.js.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const WEEKDAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function mondayOf(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}
function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function toDDMM(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

export default async function TimesheetsGridPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const supabase = createClient();

  const todayWita = witaDateKey(new Date());
  const monday = mondayOf(searchParams.week || todayWita);
  const days = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(monday, i)));
  const weekStart = days[0];
  const weekEnd = days[6];

  const prevWeek = toDateStr(addDays(monday, -7));
  const nextWeek = toDateStr(addDays(monday, 7));

  const { data: employees } = await supabase
    .from("employees")
    .select("id, full_name, nip")
    .eq("is_active", true)
    .order("full_name");

  const { data: records } = await fetchAllRows<
    Pick<AttendanceRecord, "employee_id" | "type" | "server_time" | "status" | "is_late">
  >((a, b) =>
    supabase
      .from("attendance")
      .select("employee_id, type, server_time, status, is_late")
      .eq("status", "valid")
      .gte("server_time", `${weekStart}T00:00:00+08:00`)
      .lte("server_time", `${weekEnd}T23:59:59.999+08:00`)
      .order("server_time", { ascending: true })
      .order("id")
      .range(a, b)
  );

  const rows = (records ?? []) as Pick<
    AttendanceRecord,
    "employee_id" | "type" | "server_time" | "status" | "is_late"
  >[];

  // employeeId -> dayKey -> { minutes, late }
  const grid = new Map<string, Map<string, { minutes: number; late: boolean }>>();

  const byEmployee = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byEmployee.has(r.employee_id)) byEmployee.set(r.employee_id, []);
    byEmployee.get(r.employee_id)!.push(r);
  }

  for (const [empId, empRows] of byEmployee) {
    const byDay = new Map<string, typeof rows>();
    for (const r of empRows) {
      const key = witaDateKey(new Date(r.server_time));
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(r);
    }
    const dayMap = new Map<string, { minutes: number; late: boolean }>();
    for (const [dayKey, dayRows] of byDay) {
      let minutes = 0;
      let lastIn: Date | null = null;
      let late = false;
      for (const r of dayRows) {
        if (r.type === "in") {
          lastIn = new Date(r.server_time);
          if (r.is_late) late = true;
        } else if (r.type === "out" && lastIn) {
          minutes += (new Date(r.server_time).getTime() - lastIn.getTime()) / 60000;
          lastIn = null;
        }
      }
      dayMap.set(dayKey, { minutes, late });
    }
    grid.set(empId, dayMap);
  }

  const exportParams = new URLSearchParams({ from: weekStart, to: weekEnd });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Timesheets</h1>
        <p className="text-sm text-slate-500">Absensi — rekap jam kerja mingguan per pegawai.</p>
      </div>

      <AttendanceTabs active="grid" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/admin/attendance?week=${prevWeek}`} className="btn-secondary !px-2 !py-2">
            <ChevronLeft size={18} />
          </Link>
          <span className="text-sm font-medium text-slate-700">
            {toDDMM(weekStart)} – {toDDMM(weekEnd)}
          </span>
          <Link href={`/admin/attendance?week=${nextWeek}`} className="btn-secondary !px-2 !py-2">
            <ChevronRight size={18} />
          </Link>
          {searchParams.week && searchParams.week !== todayWita && (
            <Link href="/admin/attendance" className="text-xs font-medium text-brand-600 underline">
              Minggu ini
            </Link>
          )}
        </div>
        <a href={`/api/attendance/export?${exportParams.toString()}`} className="btn-primary">
          <Download size={18} />
          Export Excel
        </a>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Pegawai</th>
              {days.map((d, i) => (
                <th key={d} className="px-3 py-3 text-center">
                  <div>{WEEKDAY_LABELS[i]}</div>
                  <div className="text-xs font-normal text-slate-400">{toDDMM(d)}</div>
                </th>
              ))}
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees?.map((e) => {
              const dayMap = grid.get(e.id);
              let total = 0;
              return (
                <tr key={e.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{e.full_name}</p>
                    <p className="text-xs text-slate-500">{e.nip}</p>
                  </td>
                  {days.map((d) => {
                    const cell = dayMap?.get(d);
                    if (cell) total += cell.minutes;
                    return (
                      <td key={d} className="px-3 py-3 text-center">
                        {cell ? (
                          <Link
                            href={`/admin/attendance/log?employee_id=${e.id}&from=${d}&to=${d}`}
                            title="Klik untuk edit/hapus data absensi hari ini"
                            className={`inline-flex items-center gap-1 underline-offset-2 hover:underline ${
                              cell.late ? "text-amber-600" : "text-slate-700"
                            }`}
                          >
                            {cell.late && <AlertTriangle size={12} />}
                            {cell.minutes > 0 ? formatDurationMinutes(cell.minutes) : "Masuk"}
                          </Link>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">
                    {formatDurationMinutes(total)}
                  </td>
                </tr>
              );
            })}
            {(!employees || employees.length === 0) && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  Belum ada pegawai aktif.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Jam terhitung dari pasangan absen masuk → pulang yang valid pada hari yang sama (WITA).
        <AlertTriangle className="mx-1 inline text-amber-600" size={12} />
        menandai hari dengan absen masuk terlambat. Klik angka jam pada sel untuk membuka data absensi hari
        itu dan mengoreksi (Edit) atau menghapusnya; atau buka tab <strong>Log Absensi</strong> di atas.
      </p>
    </div>
  );
}

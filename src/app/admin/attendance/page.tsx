import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { witaDateKey } from "@/lib/geo";
import { Download, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import Link from "next/link";
import AttendanceTabs from "./AttendanceTabs";
import TimesheetPeriodTabs from "./TimesheetPeriodTabs";
import TimesheetGridTable from "./TimesheetGridTable";
import TimesheetDayTable, { type DayRow } from "./TimesheetDayTable";
import {
  addDays,
  buildAttendanceGrid,
  monthOf,
  monthRange,
  shiftMonth,
  toDateStr,
  toDDMM,
  weekRange,
} from "@/lib/reports/attendanceGrid";
import type { AttendanceRecord } from "@/types";

// Selalu render ulang & ambil data terbaru dari Supabase — jangan di-cache Next.js.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ViewMode = "day" | "week" | "month";

const FULL_DATE_FMT = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function fullDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return FULL_DATE_FMT.format(new Date(Date.UTC(y, m - 1, d)));
}

export default async function TimesheetsGridPage({
  searchParams,
}: {
  searchParams: { view?: string; week?: string; date?: string; month?: string };
}) {
  const supabase = createClient();
  const todayWita = witaDateKey(new Date());

  const view: ViewMode = searchParams.view === "day" || searchParams.view === "month" ? searchParams.view : "week";

  // Tentukan rentang tanggal & judul periode sesuai tab aktif (Harian / Mingguan / Bulanan).
  let start: string;
  let end: string;
  let days: string[];
  let periodLabel: string;
  let prevHref: string;
  let nextHref: string;
  let resetHref: string | null = null;

  if (view === "day") {
    const date = searchParams.date || todayWita;
    start = end = date;
    days = [date];
    periodLabel = fullDateLabel(date);
    prevHref = `/admin/attendance?view=day&date=${toDateStr(addDays(new Date(`${date}T00:00:00Z`), -1))}`;
    nextHref = `/admin/attendance?view=day&date=${toDateStr(addDays(new Date(`${date}T00:00:00Z`), 1))}`;
    if (searchParams.date && searchParams.date !== todayWita) resetHref = "/admin/attendance?view=day";
  } else if (view === "month") {
    const month = searchParams.month || monthOf(todayWita);
    const range = monthRange(month);
    start = range.start;
    end = range.end;
    days = range.days;
    periodLabel = range.label;
    prevHref = `/admin/attendance?view=month&month=${shiftMonth(month, -1)}`;
    nextHref = `/admin/attendance?view=month&month=${shiftMonth(month, 1)}`;
    if (searchParams.month && searchParams.month !== monthOf(todayWita)) resetHref = "/admin/attendance?view=month";
  } else {
    const range = weekRange(searchParams.week || todayWita);
    start = range.start;
    end = range.end;
    days = range.days;
    periodLabel = `${toDDMM(range.start)} – ${toDDMM(range.end)}`;
    prevHref = `/admin/attendance?view=week&week=${toDateStr(addDays(new Date(`${range.start}T00:00:00Z`), -7))}`;
    nextHref = `/admin/attendance?view=week&week=${toDateStr(addDays(new Date(`${range.start}T00:00:00Z`), 7))}`;
    if (searchParams.week && searchParams.week !== todayWita) resetHref = "/admin/attendance?view=week";
  }

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
      .gte("server_time", `${start}T00:00:00+08:00`)
      .lte("server_time", `${end}T23:59:59.999+08:00`)
      .order("server_time", { ascending: true })
      .order("id")
      .range(a, b)
  );

  const rows = (records ?? []) as Pick<
    AttendanceRecord,
    "employee_id" | "type" | "server_time" | "status" | "is_late"
  >[];

  const exportParams = new URLSearchParams({ from: start, to: end, view });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Timesheets</h1>
        <p className="text-sm text-slate-500">Absensi — rekap jam kerja per pegawai, per hari / minggu / bulan.</p>
      </div>

      <AttendanceTabs active="grid" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TimesheetPeriodTabs active={view} />
        <a href={`/api/attendance/export?${exportParams.toString()}`} className="btn-primary">
          <Download size={18} />
          Export Excel ({view === "day" ? "Harian" : view === "month" ? "Bulanan" : "Mingguan"})
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={prevHref} className="btn-secondary !px-2 !py-2">
          <ChevronLeft size={18} />
        </Link>
        <span className="text-sm font-medium capitalize text-slate-700">{periodLabel}</span>
        <Link href={nextHref} className="btn-secondary !px-2 !py-2">
          <ChevronRight size={18} />
        </Link>
        {resetHref && (
          <Link href={resetHref} className="text-xs font-medium text-brand-600 underline">
            {view === "day" ? "Hari ini" : view === "month" ? "Bulan ini" : "Minggu ini"}
          </Link>
        )}
      </div>

      {view === "day" ? (
        <TimesheetDayTable date={start} rows={buildDayRows(employees ?? [], rows)} />
      ) : (
        <TimesheetGridTable
          employees={employees ?? []}
          days={days}
          grid={buildAttendanceGrid(rows)}
          compact={view === "month"}
        />
      )}

      <p className="text-xs text-slate-400">
        Jam terhitung dari pasangan absen masuk → pulang yang valid pada hari yang sama (WITA).
        <AlertTriangle className="mx-1 inline text-amber-600" size={12} />
        menandai hari dengan absen masuk terlambat. Klik jam pada tabel untuk membuka data absensi hari itu dan
        mengoreksi (Edit) atau menghapusnya; atau buka tab <strong>Log Absensi</strong> di atas.
      </p>
    </div>
  );
}

/** Susun baris untuk tampilan Harian: absen masuk paling awal & absen pulang paling akhir per pegawai. */
function buildDayRows(
  employees: { id: string; full_name: string; nip: string | null }[],
  rows: Pick<AttendanceRecord, "employee_id" | "type" | "server_time" | "is_late">[]
): DayRow[] {
  const byEmployee = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byEmployee.has(r.employee_id)) byEmployee.set(r.employee_id, []);
    byEmployee.get(r.employee_id)!.push(r);
  }

  return employees.map((e) => {
    const empRows = byEmployee.get(e.id) ?? [];
    let firstIn: string | null = null;
    let lastOut: string | null = null;
    let late = false;
    for (const r of empRows) {
      if (r.type === "in") {
        if (!firstIn || new Date(r.server_time) < new Date(firstIn)) firstIn = r.server_time;
        if (r.is_late) late = true;
      } else if (r.type === "out") {
        if (!lastOut || new Date(r.server_time) > new Date(lastOut)) lastOut = r.server_time;
      }
    }
    const minutes = firstIn && lastOut ? (new Date(lastOut).getTime() - new Date(firstIn).getTime()) / 60000 : 0;
    return { employee: e, firstIn, lastOut, minutes, late };
  });
}

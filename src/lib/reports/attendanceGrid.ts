import { witaDateKey } from "@/lib/geo";
import type { AttendanceRecord } from "@/types";

/**
 * Helper tanggal & agregasi grid absensi (Pegawai x Hari) — dipakai bersama oleh:
 * - halaman Timesheets admin (Harian / Mingguan / Bulanan)
 * - export Excel (/api/attendance/export)
 *
 * Semua tanggal dihitung dalam patokan kalender WITA (Asia/Makassar), direpresentasikan
 * sebagai string "YYYY-MM-DD" dan dimanipulasi lewat Date UTC agar bebas dari pergeseran
 * zona waktu lokal server.
 */

export const WEEKDAY_LABELS_MON_FIRST = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const WEEKDAY_LABELS_SUN_FIRST = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const MONTH_LABEL_FMT = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });

export function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

export function toDDMM(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

export function weekdayShort(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return WEEKDAY_LABELS_SUN_FIRST[date.getUTCDay()];
}

/** Senin dari minggu yang memuat dateStr (ISO week, Senin–Minggu). */
export function mondayOf(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay(); // 0=Min..6=Sab
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

/** Rentang 1 minggu (Senin s.d. Minggu) yang memuat dateStr. */
export function weekRange(dateStr: string): { start: string; end: string; days: string[] } {
  const monday = mondayOf(dateStr);
  const days = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(monday, i)));
  return { start: days[0], end: days[6], days };
}

/** Rentang 1 bulan penuh untuk monthStr "YYYY-MM". */
export function monthRange(monthStr: string): { start: string; end: string; days: string[]; label: string } {
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // hari terakhir bulan tsb
  const days: string[] = [];
  let cur = start;
  while (cur.getTime() <= end.getTime()) {
    days.push(toDateStr(cur));
    cur = addDays(cur, 1);
  }
  return { start: toDateStr(start), end: toDateStr(end), days, label: MONTH_LABEL_FMT.format(start) };
}

export function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Daftar tanggal (YYYY-MM-DD) inklusif dari startStr s.d. endStr. */
export function rangeDays(startStr: string, endStr: string): string[] {
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  let cur = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  const out: string[] = [];
  while (cur.getTime() <= end.getTime()) {
    out.push(toDateStr(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export type AttendanceGridCell = { minutes: number; late: boolean };
export type AttendanceGrid = Map<string, Map<string, AttendanceGridCell>>;

type GridRow = Pick<AttendanceRecord, "employee_id" | "type" | "server_time" | "is_late">;

/**
 * Susun baris absensi (sudah difilter status="valid") menjadi grid employeeId -> dayKey (WITA)
 * -> { minutes, late }. Jam kerja dihitung dari pasangan absen masuk -> pulang pada hari yang sama.
 */
export function buildAttendanceGrid(rows: GridRow[]): AttendanceGrid {
  const grid: AttendanceGrid = new Map();

  const byEmployee = new Map<string, GridRow[]>();
  for (const r of rows) {
    if (!byEmployee.has(r.employee_id)) byEmployee.set(r.employee_id, []);
    byEmployee.get(r.employee_id)!.push(r);
  }

  for (const [empId, empRows] of byEmployee) {
    const byDay = new Map<string, GridRow[]>();
    for (const r of empRows) {
      const key = witaDateKey(new Date(r.server_time));
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(r);
    }
    const dayMap = new Map<string, AttendanceGridCell>();
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

  return grid;
}

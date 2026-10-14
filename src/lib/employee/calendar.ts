import type { AttendanceRecord, Employee, LeaveRequest, LeaveType } from "@/types";
import { groupByDay, type AttendanceDay } from "@/lib/employee/history";
import { isWorkday } from "@/lib/reports/absenceStatus";
import { monthRange, rangeDays } from "@/lib/reports/attendanceGrid";

/**
 * Status satu hari pada Kalender Kehadiran pegawai. Aturan MENGIKUTI logika yang sudah dipakai
 * Timesheets admin (lib/reports/absenceStatus.ts) supaya angkanya konsisten:
 *  1. Ada absensi VALID pada hari itu -> "hadir" / "terlambat" (is_late dari data tersimpan).
 *  2. Tidak ada absensi valid, tetapi ada pengajuan APPROVED yang membebaskan absen -> jenisnya
 *     (cuti/izin/sakit/dinas). "pengecualian_apel" TIDAK dihitung di sini (tetap wajib absen).
 *  3. Hari kerja yang sudah lewat, tanpa 1 & 2, pegawai aktif & rekam wajah approved -> "tanpa_berita".
 *  4. Sabtu/Minggu tanpa absensi -> "libur". Selain itu (hari ini/mendatang tanpa data) -> null.
 * Hari libur nasional BELUM didukung (tidak ada datanya di sistem) — lihat Tahap 6.
 */
export type CalendarStatus =
  | "hadir"
  | "terlambat"
  | "cuti"
  | "izin"
  | "sakit"
  | "dinas_dalam"
  | "dinas_luar"
  | "tanpa_berita"
  | "libur";

export const CALENDAR_STATUS_LABEL: Record<CalendarStatus, string> = {
  hadir: "Hadir",
  terlambat: "Terlambat",
  cuti: "Cuti",
  izin: "Izin",
  sakit: "Sakit",
  dinas_dalam: "Dinas Dalam Daerah",
  dinas_luar: "Dinas Luar Daerah",
  tanpa_berita: "Tanpa Berita",
  libur: "Akhir Pekan",
};

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  day: number;
  status: CalendarStatus | null;
  attendance: AttendanceDay | null;
  leave: LeaveRequest | null; // pengajuan approved yang mencakup hari ini (bukan pengecualian apel)
  apelExemption: LeaveRequest | null;
  isToday: boolean;
  isFuture: boolean;
}

export interface MonthCalendar {
  /** Sel kalender mulai Senin; null = sel kosong pengisi awal/akhir pekan. */
  cells: (CalendarDay | null)[];
  days: CalendarDay[];
  summary: Record<"hadir" | "terlambat" | "cuti" | "izin" | "sakit" | "dinas" | "tanpa_berita", number>;
}

type CalendarLeave = Pick<
  LeaveRequest,
  "id" | "employee_id" | "type" | "start_date" | "end_date" | "status" | "reason" | "destination" | "letter_number" | "apel_exemption_reason"
>;

export function buildMonthCalendar(input: {
  year: number;
  month: number; // 1-12
  attendance: AttendanceRecord[];
  leaves: CalendarLeave[];
  employee: Pick<Employee, "is_active" | "face_enrollment_status">;
  todayKey: string; // YYYY-MM-DD (WITA, dari jam server)
}): MonthCalendar {
  const { year, month, attendance, leaves, employee, todayKey } = input;
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const range = monthRange(monthStr);

  const byDay = new Map<string, AttendanceDay>();
  for (const d of groupByDay(attendance)) byDay.set(d.key, d);

  const leaveByDay = new Map<string, CalendarLeave>();
  const exemptionByDay = new Map<string, CalendarLeave>();
  for (const l of leaves) {
    if (l.status !== "approved") continue;
    const target = l.type === "pengecualian_apel" ? exemptionByDay : leaveByDay;
    for (const day of rangeDays(l.start_date, l.end_date)) {
      if (!target.has(day)) target.set(day, l);
    }
  }

  const eligibleAbsent = employee.is_active && employee.face_enrollment_status === "approved";

  const days: CalendarDay[] = range.days.map((date) => {
    const attendanceDay = byDay.get(date) ?? null;
    const hasValid = !!attendanceDay && (!!attendanceDay.firstIn || !!attendanceDay.lastOut);
    const leave = leaveByDay.get(date) ?? null;
    const isToday = date === todayKey;
    const isFuture = date > todayKey;
    const workday = isWorkday(date);

    let status: CalendarStatus | null = null;
    if (hasValid) {
      status = attendanceDay!.firstIn?.is_late ? "terlambat" : "hadir";
    } else if (workday && leave) {
      status = leave.type as Exclude<LeaveType, "pengecualian_apel"> as CalendarStatus;
    } else if (!workday) {
      status = "libur";
    } else if (!isToday && !isFuture && eligibleAbsent) {
      status = "tanpa_berita";
    }

    return {
      date,
      day: Number(date.slice(8, 10)),
      status,
      attendance: attendanceDay,
      leave: workday ? (leave as LeaveRequest | null) : null,
      apelExemption: (exemptionByDay.get(date) as LeaveRequest | undefined) ?? null,
      isToday,
      isFuture,
    };
  });

  // Offset awal: Senin = 0 ... Minggu = 6
  const [y, m] = [year, month];
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const offset = (firstDow + 6) % 7;
  const cells: (CalendarDay | null)[] = [...Array(offset).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const count = (s: CalendarStatus) => days.filter((d) => d.status === s).length;
  return {
    cells,
    days,
    summary: {
      hadir: count("hadir") + count("terlambat"), // terlambat tetap hari hadir
      terlambat: count("terlambat"),
      cuti: count("cuti"),
      izin: count("izin"),
      sakit: count("sakit"),
      dinas: count("dinas_dalam") + count("dinas_luar"),
      tanpa_berita: count("tanpa_berita"),
    },
  };
}

/** Batas WITA awal bulan, untuk query attendance (server_time timestamptz). */
export function monthBoundsIso(year: number, month: number): { startIso: string; endIso: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ny = month === 12 ? year + 1 : year;
  const nm = month === 12 ? 1 : month + 1;
  return {
    startIso: `${year}-${pad(month)}-01T00:00:00+08:00`,
    endIso: `${ny}-${pad(nm)}-01T00:00:00+08:00`,
  };
}

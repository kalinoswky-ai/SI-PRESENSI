import type { Employee, LeaveRequest, LeaveType } from "@/types";
import { LEAVE_TYPE_LABEL } from "@/types";
import { rangeDays } from "@/lib/reports/attendanceGrid";

/**
 * Status "Tanpa Berita": pegawai yang REKAM WAJAHNYA SUDAH AKTIF (face_enrollment_status
 * = "approved") dan akunnya aktif, sehingga sudah bisa mengklik tombol absensi — tetapi
 * pada suatu hari kerja sama sekali TIDAK melakukan absen masuk maupun absen pulang, dan
 * TIDAK sedang cuti/izin/sakit yang disetujui pada hari itu.
 *
 * Dipakai bersama oleh tampilan Timesheets (Harian & grid Mingguan/Bulanan) dan file
 * export Excel (sheet Rekap & Resume) agar labelnya konsisten di semua tempat.
 */

export const TANPA_BERITA_LABEL = "Tanpa Berita";

export type AbsenceEmployee = Pick<Employee, "id" | "full_name" | "face_enrollment_status" | "is_active"> &
  Partial<Pick<Employee, "nip" | "position">>;

/** "employeeId|YYYY-MM-DD" -> jenis cuti yang disetujui pada tanggal tsb. */
export type LeaveDayMap = Map<string, LeaveType>;

function leaveDayKey(employeeId: string, date: string): string {
  return `${employeeId}|${date}`;
}

/**
 * Bangun peta hari yang tercakup pengajuan cuti/izin/sakit BERSTATUS APPROVED, dari
 * start_date s.d. end_date (inklusif). Dipakai untuk mengecualikan hari tsb dari status
 * "Tanpa Berita" — pegawai yang cuti/izin/sakit resmi bukan "tanpa berita".
 */
export function buildLeaveDayMap(
  leaves: Pick<LeaveRequest, "employee_id" | "start_date" | "end_date" | "type" | "status">[]
): LeaveDayMap {
  const map: LeaveDayMap = new Map();
  for (const l of leaves) {
    if (l.status !== "approved") continue;
    for (const day of rangeDays(l.start_date, l.end_date)) {
      map.set(leaveDayKey(l.employee_id, day), l.type);
    }
  }
  return map;
}

/** true bila tanggal (YYYY-MM-DD) adalah hari kerja Senin–Jumat (Sabtu/Minggu dilewati). */
export function isWorkday(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Min .. 6=Sab
  return day >= 1 && day <= 5;
}

/**
 * Tentukan label hari absen untuk satu pegawai pada satu tanggal, KETIKA pegawai tsb
 * tidak punya absen masuk maupun pulang yang valid pada hari itu. Mengembalikan null bila
 * tidak perlu diberi label apa pun (hari libur, pegawai belum aktif rekam wajahnya, atau
 * akun nonaktif) — kondisi tsb tetap ditampilkan sebagai "-" seperti sebelumnya.
 *
 * - Sedang cuti/izin/sakit yang disetujui pada tanggal itu → label jenis cuti tsb.
 * - Selain itu, bila rekam wajah sudah "approved" & akun aktif & hari kerja → "Tanpa Berita".
 */
export function resolveAbsentDayLabel(
  employee: AbsenceEmployee,
  date: string,
  leaveMap: LeaveDayMap
): string | null {
  if (!isWorkday(date)) return null;

  const leaveType = leaveMap.get(leaveDayKey(employee.id, date));
  if (leaveType) return LEAVE_TYPE_LABEL[leaveType];

  if (employee.is_active && employee.face_enrollment_status === "approved") {
    return TANPA_BERITA_LABEL;
  }
  return null;
}

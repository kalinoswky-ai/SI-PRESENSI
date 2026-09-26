import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatDurationMinutes } from "@/lib/geo";
import { toDDMM, weekdayShort, type AttendanceGrid } from "@/lib/reports/attendanceGrid";
import { resolveAbsentDayLabel, TANPA_BERITA_LABEL, type AbsenceEmployee, type LeaveDayMap } from "@/lib/reports/absenceStatus";

/**
 * Tabel grid Pegawai x Hari, dipakai bersama oleh tampilan Mingguan & Bulanan.
 * Header (baris hari) & kolom pertama (nama pegawai) di-"freeze" (sticky) supaya
 * tetap terlihat saat tabel di-scroll — baik scroll ke bawah (banyak pegawai)
 * maupun scroll ke samping (banyak kolom tanggal, terutama pada tampilan Bulanan).
 */
export default function TimesheetGridTable({
  employees,
  days,
  grid,
  leaveMap,
  compact = false,
}: {
  employees: AbsenceEmployee[];
  days: string[];
  grid: AttendanceGrid;
  leaveMap: LeaveDayMap;
  /** Kolom lebih ramping untuk tampilan Bulanan (banyak kolom). */
  compact?: boolean;
}) {
  const dayColClass = compact ? "min-w-[56px] px-1.5 py-2" : "min-w-[76px] px-3 py-3";

  return (
    <div className="card max-h-[75vh] overflow-auto p-0">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="sticky left-0 top-0 z-30 min-w-[190px] border-b border-slate-200 bg-slate-50 px-4 py-3">
              Pegawai
            </th>
            {days.map((d) => (
              <th
                key={d}
                className={`sticky top-0 z-20 border-b border-slate-200 bg-slate-50 text-center ${dayColClass}`}
              >
                <div>{weekdayShort(d)}</div>
                <div className="text-xs font-normal text-slate-400">{toDDMM(d)}</div>
              </th>
            ))}
            <th className="sticky top-0 z-20 min-w-[90px] border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {employees.map((e) => {
            const dayMap = grid.get(e.id);
            let total = 0;
            return (
              <tr key={e.id} className="group">
                <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-4 py-3 group-hover:bg-slate-50">
                  <p className="font-medium text-slate-800">{e.full_name}</p>
                  <p className="text-xs text-slate-500">{e.nip}</p>
                </td>
                {days.map((d) => {
                  const cell = dayMap?.get(d);
                  if (cell) total += cell.minutes;
                  const absentLabel = !cell ? resolveAbsentDayLabel(e, d, leaveMap) : null;
                  return (
                    <td key={d} className={`border-b border-slate-100 text-center ${dayColClass}`}>
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
                      ) : absentLabel === TANPA_BERITA_LABEL ? (
                        <span
                          title="Rekam wajah sudah aktif, tetapi tidak ada absen masuk maupun pulang hari ini."
                          className="inline-flex items-center gap-0.5 rounded bg-rose-50 px-1 py-0.5 text-xs font-medium text-rose-700"
                        >
                          TB
                        </span>
                      ) : absentLabel ? (
                        <span
                          title={absentLabel}
                          className="inline-flex items-center rounded bg-slate-100 px-1 py-0.5 text-xs font-medium text-slate-600"
                        >
                          {absentLabel}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  );
                })}
                <td className="border-b border-slate-100 px-4 py-3 text-right font-semibold text-slate-800">
                  {formatDurationMinutes(total)}
                </td>
              </tr>
            );
          })}
          {employees.length === 0 && (
            <tr>
              <td colSpan={days.length + 2} className="px-4 py-8 text-center text-slate-400">
                Belum ada pegawai aktif.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

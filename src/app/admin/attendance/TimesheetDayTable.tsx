import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatDurationMinutes } from "@/lib/geo";

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Makassar",
  hour: "2-digit",
  minute: "2-digit",
});

export type DayRow = {
  employee: { id: string; full_name: string; nip?: string | null };
  firstIn: string | null; // ISO server_time absen masuk paling awal
  lastOut: string | null; // ISO server_time absen pulang paling akhir
  minutes: number;
  late: boolean;
  /**
   * Terisi ketika TIDAK ada absen masuk maupun pulang sama sekali hari itu: "Tanpa Berita"
   * (rekam wajah sudah aktif tapi tidak absen), atau label cuti/izin/sakit bila sedang cuti
   * resmi yang disetujui. null bila tidak berlaku (hari libur / rekam wajah belum aktif).
   */
  absentLabel: string | null;
};

/**
 * Tabel Timesheets tampilan Harian: satu baris per pegawai untuk satu tanggal,
 * dengan kolom Jam Masuk / Jam Pulang / Durasi / Status (lebih detail dibanding
 * grid mingguan/bulanan karena hanya memuat satu hari).
 * Header & kolom pertama tetap di-freeze agar konsisten dengan tampilan lainnya.
 */
export default function TimesheetDayTable({ date, rows }: { date: string; rows: DayRow[] }) {
  return (
    <div className="card max-h-[75vh] overflow-auto p-0">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="sticky left-0 top-0 z-30 min-w-[190px] border-b border-slate-200 bg-slate-50 px-4 py-3">
              Pegawai
            </th>
            <th className="sticky top-0 z-20 min-w-[100px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-center">
              Jam Masuk
            </th>
            <th className="sticky top-0 z-20 min-w-[100px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-center">
              Jam Pulang
            </th>
            <th className="sticky top-0 z-20 min-w-[100px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-center">
              Durasi
            </th>
            <th className="sticky top-0 z-20 min-w-[110px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-center">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ employee: e, firstIn, lastOut, minutes, late, absentLabel }) => (
            <tr key={e.id} className="group">
              <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-4 py-3 group-hover:bg-slate-50">
                <p className="font-medium text-slate-800">{e.full_name}</p>
                <p className="text-xs text-slate-500">{e.nip}</p>
              </td>
              <td className="border-b border-slate-100 px-3 py-3 text-center">
                {firstIn ? (
                  <Link
                    href={`/admin/attendance/log?employee_id=${e.id}&from=${date}&to=${date}`}
                    title="Klik untuk edit/hapus data absensi hari ini"
                    className={`inline-flex items-center gap-1 underline-offset-2 hover:underline ${
                      late ? "text-amber-600" : "text-slate-700"
                    }`}
                  >
                    {late && <AlertTriangle size={12} />}
                    {TIME_FMT.format(new Date(firstIn))}
                  </Link>
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
              <td className="border-b border-slate-100 px-3 py-3 text-center">
                {lastOut ? (
                  <Link
                    href={`/admin/attendance/log?employee_id=${e.id}&from=${date}&to=${date}`}
                    title="Klik untuk edit/hapus data absensi hari ini"
                    className="text-slate-700 underline-offset-2 hover:underline"
                  >
                    {TIME_FMT.format(new Date(lastOut))}
                  </Link>
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
              <td className="border-b border-slate-100 px-3 py-3 text-center font-semibold text-slate-800">
                {minutes > 0 ? formatDurationMinutes(minutes) : <span className="text-slate-300">-</span>}
              </td>
              <td className="border-b border-slate-100 px-3 py-3 text-center">
                {!firstIn && absentLabel === "Tanpa Berita" ? (
                  <span
                    title="Rekam wajah sudah aktif, tetapi tidak ada absen masuk maupun pulang hari ini."
                    className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700"
                  >
                    <AlertTriangle size={12} /> Tanpa Berita
                  </span>
                ) : !firstIn && absentLabel ? (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {absentLabel}
                  </span>
                ) : !firstIn ? (
                  <span className="text-slate-300">Tidak Masuk</span>
                ) : late ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    <AlertTriangle size={12} /> Terlambat
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Tepat Waktu
                  </span>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                Belum ada pegawai aktif.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

import type { AttendanceRecord } from "@/types";
import { witaDateKey } from "@/lib/geo";

/** Satu hari absensi milik pegawai (dikelompokkan menurut tanggal WITA). */
export interface AttendanceDay {
  key: string; // YYYY-MM-DD (WITA)
  firstIn: AttendanceRecord | null; // absen masuk valid paling awal
  lastOut: AttendanceRecord | null; // absen pulang valid paling akhir
  rejected: AttendanceRecord[]; // percobaan yang ditolak
  workMinutes: number | null;
}

const TIME_FMT = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Makassar",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const DAY_FMT = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Makassar",
  weekday: "long",
  day: "numeric",
  month: "short",
});

export const formatTime = (iso: string) => TIME_FMT.format(new Date(iso));
export const formatDayLabel = (key: string) => DAY_FMT.format(new Date(`${key}T12:00:00+08:00`));

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}

/** Kelompokkan catatan absensi per hari (terbaru dulu). Hanya mengolah data yang diberikan. */
export function groupByDay(records: AttendanceRecord[]): AttendanceDay[] {
  const map = new Map<string, AttendanceRecord[]>();
  for (const r of records) {
    const key = witaDateKey(new Date(r.server_time));
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }

  const days: AttendanceDay[] = [];
  map.forEach((rows, key) => {
    const byTime = [...rows].sort((a, b) => new Date(a.server_time).getTime() - new Date(b.server_time).getTime());
    const ins = byTime.filter((r) => r.type === "in" && r.status === "valid");
    const outs = byTime.filter((r) => r.type === "out" && r.status === "valid");
    const firstIn = ins[0] ?? null;
    const lastOut = outs[outs.length - 1] ?? null;
    const workMinutes =
      firstIn && lastOut
        ? Math.max(0, Math.round((new Date(lastOut.server_time).getTime() - new Date(firstIn.server_time).getTime()) / 60000))
        : null;
    days.push({ key, firstIn, lastOut, rejected: byTime.filter((r) => r.status === "rejected"), workMinutes });
  });

  return days.sort((a, b) => (a.key < b.key ? 1 : -1));
}

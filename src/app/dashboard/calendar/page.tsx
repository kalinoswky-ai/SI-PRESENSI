"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { mapsUrl, formatDistance, witaDateKey } from "@/lib/geo";
import type { AttendanceRecord, Employee, LeaveRequest } from "@/types";
import { APEL_EXEMPTION_REASON_LABEL, LEAVE_TYPE_LABEL, isPerjadinType } from "@/types";
import { formatDayLabel, formatDuration, formatTime } from "@/lib/employee/history";
import {
  buildMonthCalendar,
  monthBoundsIso,
  CALENDAR_STATUS_LABEL,
  type CalendarDay,
  type CalendarStatus,
} from "@/lib/employee/calendar";
import { WEEKDAY_LABELS_MON_FIRST } from "@/lib/reports/attendanceGrid";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");
const monthLabel = (y: number, m: number) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", month: "long", year: "numeric" }).format(
    new Date(`${y}-${pad(m)}-15T12:00:00+08:00`)
  );

// Kelas ditulis lengkap (bukan dirakit) agar terbaca oleh Tailwind. Kode singkat ditampilkan
// di sel supaya status tidak hanya dibedakan lewat warna.
const STATUS_STYLE: Record<CalendarStatus, { cell: string; dot: string; badge: string; code: string }> = {
  hadir: { cell: "bg-teal-50 text-teal-800", dot: "bg-teal-500", badge: "bg-teal-50 text-teal-700", code: "H" },
  terlambat: { cell: "bg-amber-50 text-amber-800", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700", code: "T" },
  cuti: { cell: "bg-violet-50 text-violet-800", dot: "bg-violet-500", badge: "bg-violet-50 text-violet-700", code: "C" },
  izin: { cell: "bg-sky-50 text-sky-800", dot: "bg-sky-500", badge: "bg-sky-50 text-sky-700", code: "I" },
  sakit: { cell: "bg-pink-50 text-pink-800", dot: "bg-pink-500", badge: "bg-pink-50 text-pink-700", code: "S" },
  dinas_dalam: { cell: "bg-indigo-50 text-indigo-800", dot: "bg-indigo-500", badge: "bg-indigo-50 text-indigo-700", code: "DD" },
  dinas_luar: { cell: "bg-indigo-50 text-indigo-800", dot: "bg-indigo-700", badge: "bg-indigo-50 text-indigo-700", code: "DL" },
  tanpa_berita: { cell: "bg-rose-50 text-rose-800", dot: "bg-rose-500", badge: "bg-rose-50 text-rose-700", code: "TB" },
  libur: { cell: "bg-slate-50 text-slate-400", dot: "bg-slate-300", badge: "bg-slate-100 text-slate-500", code: "" },
};

const LEGEND: CalendarStatus[] = ["hadir", "terlambat", "cuti", "izin", "sakit", "dinas_dalam", "dinas_luar", "tanpa_berita"];

function placeText(r: AttendanceRecord): string {
  if (r.location_label) return r.location_label;
  return r.work_mode === "wfh" ? "WFH" : formatDistance(r.distance_meters);
}

/** Kalender Kehadiran: data milik pegawai yang login (filter employee_id + RLS), per bulan. */
export default function CalendarPage() {
  const supabase = createClient();
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const [todayKey, setTodayKey] = useState<string | null>(null); // dari jam server (WITA)
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [employee, setEmployee] = useState<Pick<Employee, "is_active" | "face_enrollment_status"> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // "Hari ini" ditentukan dari jam server, bukan jam perangkat.
  useEffect(() => {
    async function init() {
      let now = new Date();
      try {
        const st = await fetch(`/api/server-time?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json());
        now = new Date(st.serverTime);
      } catch {
        // cadangan tampilan saja
      }
      const key = witaDateKey(now);
      const [y, m] = key.split("-").map(Number);
      setTodayKey(key);
      setCursor({ y, m });
      setSelected(key);
    }
    init();
  }, []);

  useEffect(() => {
    if (!cursor) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user || !cursor) return;
      const uid = userData.user.id;
      const { startIso, endIso } = monthBoundsIso(cursor.y, cursor.m);
      const monthStart = `${cursor.y}-${pad(cursor.m)}-01`;
      const monthEnd = endIso.slice(0, 10); // awal bulan berikutnya (eksklusif)

      const [empRes, attRes, leaveRes] = await Promise.all([
        supabase.from("employees").select("is_active, face_enrollment_status").eq("id", uid).single(),
        supabase
          .from("attendance")
          .select("*")
          .eq("employee_id", uid)
          .gte("server_time", startIso)
          .lt("server_time", endIso)
          .order("server_time", { ascending: true }),
        supabase
          .from("leave_requests")
          .select("*")
          .eq("employee_id", uid)
          .eq("status", "approved")
          .lt("start_date", monthEnd)
          .gte("end_date", monthStart),
      ]);

      if (cancelled) return;
      if (empRes.error || attRes.error || leaveRes.error) {
        setError("Kalender gagal dimuat. Coba muat ulang halaman.");
      }
      setEmployee((empRes.data as Pick<Employee, "is_active" | "face_enrollment_status">) ?? null);
      setRecords((attRes.data ?? []) as AttendanceRecord[]);
      setLeaves((leaveRes.data ?? []) as LeaveRequest[]);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, cursor]);

  const calendar = useMemo(() => {
    if (!cursor || !todayKey) return null;
    return buildMonthCalendar({
      year: cursor.y,
      month: cursor.m,
      attendance: records,
      leaves,
      employee: employee ?? { is_active: false, face_enrollment_status: "none" },
      todayKey,
    });
  }, [cursor, todayKey, records, leaves, employee]);

  const selectedDay: CalendarDay | null = useMemo(
    () => calendar?.days.find((d) => d.date === selected) ?? null,
    [calendar, selected]
  );

  const currentKey = todayKey ? todayKey.slice(0, 7) : null;
  const atCurrent = !!cursor && `${cursor.y}-${pad(cursor.m)}` === currentKey;

  function go(delta: number) {
    if (!cursor) return;
    const idx = cursor.y * 12 + (cursor.m - 1) + delta;
    const next = { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
    setCursor(next);
    // Pilih hari ini bila kembali ke bulan berjalan; selain itu kosongkan pilihan.
    setSelected(todayKey && todayKey.slice(0, 7) === `${next.y}-${pad(next.m)}` ? todayKey : null);
  }

  const s = calendar?.summary;
  const tiles = [
    { label: "Hadir", value: s?.hadir, tone: "text-teal-700" },
    { label: "Terlambat", value: s?.terlambat, tone: "text-amber-600" },
    { label: "Cuti/Izin/Sakit", value: s ? s.cuti + s.izin + s.sakit : undefined, tone: "text-violet-600" },
    { label: "Dinas", value: s?.dinas, tone: "text-indigo-600" },
    { label: "Tanpa Berita", value: s?.tanpa_berita, tone: "text-rose-600" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-900">Kalender Kehadiran</h1>
        <div className="flex items-center gap-1 rounded-xl bg-white/70 p-1 shadow-sm">
          <button onClick={() => go(-1)} disabled={!cursor} aria-label="Bulan sebelumnya" className="ep-icon-btn">
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold text-slate-800">
            {cursor ? monthLabel(cursor.y, cursor.m) : "..."}
          </span>
          <button onClick={() => go(1)} disabled={!cursor || atCurrent} aria-label="Bulan berikutnya" className="ep-icon-btn">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="card !p-2 text-center">
            <p className={`text-lg font-bold tabular-nums ${t.tone}`}>{loading || t.value === undefined ? "–" : t.value}</p>
            <p className="text-[10px] leading-tight text-slate-500">{t.label}</p>
          </div>
        ))}
      </div>

      {error && <p className="card border-rose-200 bg-rose-50 text-sm text-rose-700">{error}</p>}

      <div className="card !p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
          {WEEKDAY_LABELS_MON_FIRST.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className={`mt-1 grid grid-cols-7 gap-1 ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
          {(calendar?.cells ?? []).map((cell, i) => {
            if (!cell) return <div key={`e${i}`} className="aspect-square" />;
            const st = cell.status ? STATUS_STYLE[cell.status] : null;
            const isSel = cell.date === selected;
            return (
              <button
                key={cell.date}
                type="button"
                onClick={() => setSelected(cell.date)}
                aria-pressed={isSel}
                aria-label={`${formatDayLabel(cell.date)}${cell.status ? `: ${CALENDAR_STATUS_LABEL[cell.status]}` : ""}`}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm font-semibold transition ${
                  st ? st.cell : "bg-white/60 text-slate-700"
                } ${isSel ? "ring-2 ring-brand-600" : ""} ${cell.isToday ? "outline outline-2 outline-brand-500" : ""}`}
              >
                <span className="tabular-nums">{cell.day}</span>
                {st && st.code && <span className="text-[9px] font-bold leading-none">{st.code}</span>}
              </button>
            );
          })}
        </div>

        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-200/70 pt-2 text-[11px] text-slate-600">
          {LEGEND.map((k) => (
            <li key={k} className="flex items-center gap-1">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_STYLE[k].dot}`} />
              <span>
                {STATUS_STYLE[k].code} {CALENDAR_STATUS_LABEL[k]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {selectedDay ? <DayDetail day={selectedDay} /> : !loading && <p className="text-center text-xs text-slate-500">Pilih tanggal untuk melihat detail absensi.</p>}
    </div>
  );
}

function DayDetail({ day }: { day: CalendarDay }) {
  const a = day.attendance;
  const leave = day.leave;
  const st = day.status ? STATUS_STYLE[day.status] : null;

  return (
    <div className="card !p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{formatDayLabel(day.date)}</p>
        {day.status && st && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.badge}`}>{CALENDAR_STATUS_LABEL[day.status]}</span>
        )}
      </div>

      {(a?.firstIn || a?.lastOut) && (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Masuk</dt>
              <dd className="font-semibold tabular-nums text-slate-800">{a.firstIn ? formatTime(a.firstIn.server_time) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Pulang</dt>
              <dd className="font-semibold tabular-nums text-slate-800">{a.lastOut ? formatTime(a.lastOut.server_time) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Durasi</dt>
              <dd className="font-semibold tabular-nums text-slate-800">{a.workMinutes !== null ? formatDuration(a.workMinutes) : "—"}</dd>
            </div>
          </dl>
          <ul className="mt-3 space-y-1 border-t border-slate-200/70 pt-2 text-xs text-slate-500">
            {[
              { label: "Masuk", rec: a.firstIn },
              { label: "Pulang", rec: a.lastOut },
            ].map(
              ({ label, rec }) =>
                rec && (
                  <li key={label} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {label}: {placeText(rec)}
                      {label === "Masuk" && rec.work_mode === "wfh" ? " (WFH)" : ""}
                    </span>
                    <a
                      href={mapsUrl(rec.latitude, rec.longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ep-link shrink-0 text-brand-600"
                      aria-label={`Lihat lokasi absen ${label.toLowerCase()} di peta`}
                    >
                      <MapPin size={14} />
                    </a>
                  </li>
                )
            )}
          </ul>
        </>
      )}

      {leave && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <p className="font-semibold">
            {LEAVE_TYPE_LABEL[leave.type]} (disetujui) · {leave.start_date} s.d. {leave.end_date}
          </p>
          {isPerjadinType(leave.type) && leave.destination && <p>Tujuan: {leave.destination}</p>}
          {isPerjadinType(leave.type) && leave.letter_number && <p>No. SPT: {leave.letter_number}</p>}
          {leave.reason && <p className="mt-0.5 text-slate-500">{leave.reason}</p>}
        </div>
      )}

      {day.apelExemption && (
        <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
          Pengecualian apel disetujui
          {day.apelExemption.apel_exemption_reason ? ` (${APEL_EXEMPTION_REASON_LABEL[day.apelExemption.apel_exemption_reason]})` : ""}
          . Tetap wajib absen masuk/pulang.
        </p>
      )}

      {!day.isFuture && (
        <Link
          href={`/dashboard/correction?date=${day.date}`}
          className="mt-3 inline-block text-xs font-medium text-brand-600 underline"
        >
          Ajukan koreksi absensi untuk tanggal ini
        </Link>
      )}

      {a && a.rejected.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg bg-rose-50/80 px-3 py-2 text-xs text-rose-700">
          {a.rejected.map((r) => (
            <li key={r.id}>
              Absen {r.type === "in" ? "masuk" : "pulang"} ditolak pukul {formatTime(r.server_time)}
              {r.reject_reason ? ` — ${r.reject_reason}` : ""}
            </li>
          ))}
        </ul>
      )}

      {!a?.firstIn && !a?.lastOut && !leave && !day.apelExemption && !(a && a.rejected.length > 0) && (
        <p className="mt-3 text-xs text-slate-500">
          {day.status === "tanpa_berita"
            ? "Tidak ada absensi maupun pengajuan yang disetujui pada hari ini."
            : day.status === "libur"
            ? "Akhir pekan. Hari libur nasional belum tercatat di sistem."
            : day.isFuture
            ? "Belum ada data untuk tanggal ini."
            : "Belum ada absensi pada hari ini."}
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { mapsUrl, formatDistance, witaDateKey } from "@/lib/geo";
import type { AttendanceRecord } from "@/types";
import { formatDayLabel, formatDuration, formatTime, groupByDay } from "@/lib/employee/history";
import { ChevronLeft, ChevronRight, MapPin, CalendarX2 } from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");
const monthStartIso = (y: number, m: number) => `${y}-${pad(m)}-01T00:00:00+08:00`;
const monthLabel = (y: number, m: number) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", month: "long", year: "numeric" }).format(
    new Date(`${y}-${pad(m)}-15T12:00:00+08:00`)
  );

function placeText(r: AttendanceRecord): string {
  if (r.location_label) return r.location_label;
  return r.work_mode === "wfh" ? "WFH" : formatDistance(r.distance_meters);
}

/** Riwayat absensi MILIK PEGAWAI YANG LOGIN (filter employee_id + RLS), per bulan & per hari. */
export default function HistoryPage() {
  const supabase = createClient();
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const [current, setCurrent] = useState<{ y: number; m: number } | null>(null); // bulan berjalan (jam server)
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bulan berjalan ditentukan dari jam server (WITA), bukan jam perangkat.
  useEffect(() => {
    async function init() {
      let now = new Date();
      try {
        const st = await fetch(`/api/server-time?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json());
        now = new Date(st.serverTime);
      } catch {
        // pakai jam perangkat hanya sebagai cadangan tampilan
      }
      const [y, m] = witaDateKey(now).split("-").map(Number);
      setCurrent({ y, m });
      setCursor({ y, m });
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

      const nextY = cursor.m === 12 ? cursor.y + 1 : cursor.y;
      const nextM = cursor.m === 12 ? 1 : cursor.m + 1;

      const { data, error: qErr } = await supabase
        .from("attendance")
        .select("*")
        .eq("employee_id", userData.user.id)
        .gte("server_time", monthStartIso(cursor.y, cursor.m))
        .lt("server_time", monthStartIso(nextY, nextM))
        .order("server_time", { ascending: false });

      if (cancelled) return;
      if (qErr) setError("Riwayat gagal dimuat. Coba muat ulang halaman.");
      setRecords((data ?? []) as AttendanceRecord[]);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, cursor]);

  const days = useMemo(() => groupByDay(records), [records]);
  const summary = useMemo(
    () => ({
      hadir: days.filter((d) => d.firstIn).length,
      terlambat: days.filter((d) => d.firstIn?.is_late).length,
      wfh: days.filter((d) => d.firstIn?.work_mode === "wfh").length,
      ditolak: days.reduce((n, d) => n + d.rejected.length, 0),
    }),
    [days]
  );

  const atCurrent = !!cursor && !!current && cursor.y === current.y && cursor.m === current.m;
  const go = (delta: number) =>
    setCursor((c) => {
      if (!c) return c;
      const idx = c.y * 12 + (c.m - 1) + delta;
      return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
    });

  const tiles = [
    { label: "Hari hadir", value: summary.hadir, tone: "text-teal-700" },
    { label: "Terlambat", value: summary.terlambat, tone: "text-amber-600" },
    { label: "WFH", value: summary.wfh, tone: "text-brand-600" },
    { label: "Ditolak", value: summary.ditolak, tone: "text-rose-600" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-900">Riwayat Absensi Saya</h1>
        <div className="flex items-center gap-1 rounded-xl bg-white/70 p-1 shadow-sm">
          <button
            onClick={() => go(-1)}
            disabled={!cursor}
            aria-label="Bulan sebelumnya"
            className="ep-icon-btn"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold text-slate-800">
            {cursor ? monthLabel(cursor.y, cursor.m) : "..."}
          </span>
          <button
            onClick={() => go(1)}
            disabled={!cursor || atCurrent}
            aria-label="Bulan berikutnya"
            className="ep-icon-btn"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="card !p-3 text-center">
            <p className={`text-xl font-bold tabular-nums ${t.tone}`}>{loading ? "–" : t.value}</p>
            <p className="text-[11px] text-slate-500">{t.label}</p>
          </div>
        ))}
      </div>

      {error && <p className="card border-rose-200 bg-rose-50 text-sm text-rose-700">{error}</p>}

      {loading ? (
        <p className="text-center text-sm text-slate-500">Memuat...</p>
      ) : days.length === 0 && !error ? (
        <div className="card flex flex-col items-center gap-2 py-8 text-center">
          <CalendarX2 size={24} className="text-slate-400" />
          <p className="text-sm font-medium text-slate-700">Belum ada absensi di bulan ini</p>
          <p className="text-xs text-slate-500">Riwayat absen masuk dan pulang Anda akan muncul di sini.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {days.map((d) => (
            <li key={d.key} className="card !p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{formatDayLabel(d.key)}</p>
                <div className="flex flex-wrap justify-end gap-1">
                  {d.firstIn &&
                    (d.firstIn.is_late ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Terlambat</span>
                    ) : (
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">Tepat waktu</span>
                    ))}
                  {d.firstIn?.work_mode === "wfh" && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">WFH</span>
                  )}
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Masuk</dt>
                  <dd className="font-semibold tabular-nums text-slate-800">
                    {d.firstIn ? formatTime(d.firstIn.server_time) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Pulang</dt>
                  <dd className="font-semibold tabular-nums text-slate-800">
                    {d.lastOut ? formatTime(d.lastOut.server_time) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Durasi</dt>
                  <dd className="font-semibold tabular-nums text-slate-800">
                    {d.workMinutes !== null ? formatDuration(d.workMinutes) : "—"}
                  </dd>
                </div>
              </dl>

              {(d.firstIn || d.lastOut) && (
                <ul className="mt-3 space-y-1 border-t border-slate-200/70 pt-2 text-xs text-slate-500">
                  {[
                    { label: "Masuk", rec: d.firstIn },
                    { label: "Pulang", rec: d.lastOut },
                  ].map(
                    ({ label, rec }) =>
                      rec && (
                        <li key={label} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate">
                            {label}: {placeText(rec)}
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
              )}

              {d.rejected.length > 0 && (
                <ul className="mt-2 space-y-1 rounded-lg bg-rose-50/80 px-3 py-2 text-xs text-rose-700">
                  {d.rejected.map((r) => (
                    <li key={r.id}>
                      Absen {r.type === "in" ? "masuk" : "pulang"} ditolak pukul {formatTime(r.server_time)}
                      {r.reject_reason ? ` — ${r.reject_reason}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

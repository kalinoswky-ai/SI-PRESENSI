"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AttendanceRecord } from "@/types";
import { formatDayLabel, formatTime, groupByDay, type AttendanceDay } from "@/lib/employee/history";

/**
 * Pratinjau 5 hari absensi terakhir di Beranda pegawai. HANYA membaca data milik pegawai yang
 * sedang login (filter employee_id + RLS Supabase). Tidak menyentuh alur absen.
 */
export default function RecentHistory() {
  const supabase = createClient();
  const [days, setDays] = useState<AttendanceDay[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await supabase
        .from("attendance")
        .select("*")
        .eq("employee_id", userData.user.id)
        .order("server_time", { ascending: false })
        .limit(40);
      if (!cancelled) setDays(groupByDay((data ?? []) as AttendanceRecord[]).slice(0, 5));
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <section className="card !p-0" aria-labelledby="ep-recent">
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <h2 id="ep-recent" className="text-sm font-semibold text-slate-800">
          Riwayat Terbaru
        </h2>
        <Link href="/dashboard/history" className="ep-link flex items-center gap-0.5 text-xs font-medium text-brand-600">
          Lihat semua <ChevronRight size={14} />
        </Link>
      </div>

      {days === null ? (
        <p className="px-5 pb-5 text-sm text-slate-500">Memuat...</p>
      ) : days.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-slate-500">Belum ada riwayat absensi.</p>
      ) : (
        <ul className="divide-y divide-slate-200/70 px-5 pb-2">
          {days.map((d) => (
            <li key={d.key} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{formatDayLabel(d.key)}</p>
                <p className="text-xs tabular-nums text-slate-500">
                  {d.firstIn ? formatTime(d.firstIn.server_time) : "—"} – {d.lastOut ? formatTime(d.lastOut.server_time) : "—"}
                </p>
              </div>
              {d.firstIn?.is_late && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Terlambat</span>
              )}
              {!d.firstIn && d.rejected.length > 0 && (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">Ditolak</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

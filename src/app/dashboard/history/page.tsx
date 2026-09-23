"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatWita } from "@/lib/geo";
import type { AttendanceRecord } from "@/types";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

export default function HistoryPage() {
  const supabase = createClient();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data } = await supabase
        .from("attendance")
        .select("*")
        .eq("employee_id", userData.user.id)
        .order("server_time", { ascending: false })
        .limit(60);

      setRecords((data ?? []) as AttendanceRecord[]);
      setLoading(false);
    }
    load();
  }, [supabase]);

  if (loading) return <p className="text-center text-sm text-slate-500">Memuat...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">Riwayat Absensi Saya</h1>

      {records.length === 0 && (
        <p className="text-sm text-slate-500">Belum ada riwayat absensi.</p>
      )}

      <div className="space-y-2">
        {records.map((r) => (
          <div key={r.id} className="card flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {r.status === "valid" ? (
                <CheckCircle2 className="shrink-0 text-emerald-500" size={20} />
              ) : (
                <XCircle className="shrink-0 text-red-500" size={20} />
              )}
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {r.type === "in" ? "Absen Masuk" : "Absen Pulang"}
                  {r.is_late && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                      Terlambat
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">{formatWita(new Date(r.server_time))}</p>
                {r.status === "rejected" && (
                  <p className="text-xs text-red-500">{r.reject_reason}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Clock size={12} />
              {r.work_mode === "wfh" ? "WFH" : `${Math.round(r.distance_meters)}m`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

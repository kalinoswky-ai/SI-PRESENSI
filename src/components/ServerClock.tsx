"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatWita } from "@/lib/geo";

const RESYNC_MS = 5 * 60 * 1000; // sinkron ulang tiap 5 menit & saat tab kembali aktif

export default function ServerClock() {
  // Titik acuan: waktu server (ms) pada saat performance.now() = perfMs.
  // Jam berjalan memakai performance.now() (monotonik) sehingga tidak terpengaruh
  // bila jam perangkat diubah/berpindah zona setelah halaman dimuat.
  const base = useRef<{ serverMs: number; perfMs: number } | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [deviceDiffMs, setDeviceDiffMs] = useState(0);
  const [failed, setFailed] = useState(false);

  const sync = useCallback(async () => {
    try {
      const t0 = performance.now();
      const res = await fetch(`/api/server-time?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      const t1 = performance.now();
      // Koreksi latensi jaringan: anggap respons dibuat di tengah perjalanan pulang-pergi
      const serverMs = new Date(data.serverTime).getTime() + (t1 - t0) / 2;
      base.current = { serverMs, perfMs: t1 };
      setDeviceDiffMs(serverMs - Date.now());
      setFailed(false);
      setNow(new Date(serverMs));
    } catch {
      if (!base.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    sync();
    const resync = setInterval(sync, RESYNC_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(resync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sync]);

  useEffect(() => {
    const tick = setInterval(() => {
      const b = base.current;
      if (b) setNow(new Date(b.serverMs + (performance.now() - b.perfMs)));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const diffMinutes = Math.round(Math.abs(deviceDiffMs) / 60000);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span>
          Server Clock:{" "}
          <strong className="font-semibold text-slate-800">
            {now ? formatWita(now) : failed ? "gagal memuat" : "menyinkronkan..."}
          </strong>
        </span>
      </div>
      {now && Math.abs(deviceDiffMs) > 60000 && (
        <p className="text-xs text-amber-600">
          Jam perangkat Anda berbeda ±{diffMinutes} menit dari server. Absensi tetap memakai jam server.
        </p>
      )}
    </div>
  );
}

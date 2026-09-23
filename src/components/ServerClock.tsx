"use client";

import { useEffect, useState } from "react";
import { formatWita } from "@/lib/geo";

export default function ServerClock() {
  const [offsetMs, setOffsetMs] = useState<number | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    let mounted = true;
    fetch("/api/server-time")
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return;
        const serverNow = new Date(data.serverTime).getTime();
        setOffsetMs(serverNow - Date.now());
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date(Date.now() + (offsetMs ?? 0)));
    }, 1000);
    return () => clearInterval(id);
  }, [offsetMs]);

  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span>
        Server Clock: <strong className="font-semibold text-slate-800">{formatWita(now)}</strong>
      </span>
    </div>
  );
}

import type { StatusBreakdown, TrendDay } from "./types";

export const STATUS_COLORS = {
  onTime: "#0d9488",
  late: "#f59e0b",
  cuti: "#2563eb",
  izin: "#8b5cf6",
  sakit: "#f43f5e",
  tanpaBerita: "#94a3b8",
} as const;

/** Donut komposisi kehadiran hari ini. Angka juga ditulis di legenda (tidak bergantung warna). */
export function AttendanceDonut({ data }: { data: StatusBreakdown }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const total = data.onTime + data.late + data.cuti + data.izin + data.sakit + data.tanpaBerita;
  const segments = [
    { key: "onTime", value: data.onTime, color: STATUS_COLORS.onTime },
    { key: "late", value: data.late, color: STATUS_COLORS.late },
    { key: "cuti", value: data.cuti, color: STATUS_COLORS.cuti },
    { key: "izin", value: data.izin, color: STATUS_COLORS.izin },
    { key: "sakit", value: data.sakit, color: STATUS_COLORS.sakit },
    { key: "tanpaBerita", value: data.tanpaBerita, color: STATUS_COLORS.tanpaBerita },
  ];

  let offset = 0;
  const present = data.onTime + data.late;
  const rate = data.eligible > 0 ? Math.round((present / data.eligible) * 100) : null;

  return (
    <svg
      viewBox="0 0 140 140"
      className="h-40 w-40 shrink-0 -rotate-90"
      role="img"
      aria-label={`Kehadiran hari ini: ${present} dari ${data.eligible} pegawai wajib absen`}
    >
      <circle cx="70" cy="70" r={r} fill="none" stroke="#e2e8f0" strokeWidth="14" />
      {total > 0 &&
        segments.map((s) => {
          if (s.value <= 0) return null;
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={s.key}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      {/* Teks di tengah: diputar balik agar tegak */}
      <g transform="rotate(90 70 70)">
        <text x="70" y="68" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 26, fontWeight: 700 }}>
          {rate === null ? "—" : `${rate}%`}
        </text>
        <text x="70" y="86" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 10 }}>
          hadir
        </text>
      </g>
    </svg>
  );
}

const DAY = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", weekday: "short" });
const DAY_NUM = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", day: "numeric" });

/** Batang bertumpuk 7 hari terakhir: tepat waktu (teal) + terlambat (amber). */
export function AttendanceTrend({ days }: { days: TrendDay[] }) {
  const W = 560;
  const H = 210;
  const padL = 28;
  const padB = 38;
  const padT = 18;
  const chartH = H - padB - padT;
  const rawMax = Math.max(1, ...days.map((d) => d.onTime + d.late));
  const max = rawMax <= 4 ? 4 : Math.ceil(rawMax / 4) * 4;
  const slot = (W - padL) / days.length;
  const barW = Math.min(44, slot * 0.56);
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Grafik jumlah pegawai hadir per hari selama 7 hari terakhir"
    >
      {ticks.map((t) => {
        const y = padT + chartH - (t / max) * chartH;
        return (
          <g key={t}>
            <line x1={padL} x2={W} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={padL - 6} y={y + 3} textAnchor="end" className="fill-slate-400" style={{ fontSize: 10 }}>
              {t}
            </text>
          </g>
        );
      })}
      {days.map((d, i) => {
        const cx = padL + slot * i + slot / 2;
        const date = new Date(`${d.key}T12:00:00+08:00`);
        const total = d.onTime + d.late;
        const hOn = (d.onTime / max) * chartH;
        const hLate = (d.late / max) * chartH;
        const yBase = padT + chartH;
        const isToday = i === days.length - 1;
        return (
          <g key={d.key}>
            {hOn > 0 && (
              <rect x={cx - barW / 2} y={yBase - hOn} width={barW} height={hOn} rx="3" fill={STATUS_COLORS.onTime} />
            )}
            {hLate > 0 && (
              <rect
                x={cx - barW / 2}
                y={yBase - hOn - hLate}
                width={barW}
                height={hLate}
                rx="3"
                fill={STATUS_COLORS.late}
              />
            )}
            {total > 0 && (
              <text
                x={cx}
                y={yBase - hOn - hLate - 5}
                textAnchor="middle"
                className="fill-slate-700"
                style={{ fontSize: 11, fontWeight: 600 }}
              >
                {total}
              </text>
            )}
            <text
              x={cx}
              y={H - 18}
              textAnchor="middle"
              className={isToday ? "fill-slate-900" : "fill-slate-500"}
              style={{ fontSize: 11, fontWeight: isToday ? 700 : 500 }}
            >
              {DAY.format(date)}
            </text>
            <text x={cx} y={H - 5} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 10 }}>
              {DAY_NUM.format(date)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

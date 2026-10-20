import { LEAVE_TYPE_SHORT_LABEL } from "@/types";
import type { LeaveType } from "@/types";
import type { LeaveStats } from "@/lib/reports/leaveStats";

/** Warna per jenis (sama dengan palet dashboard admin). Angka selalu ditulis, tidak bergantung warna. */
export const LEAVE_COLORS: Record<LeaveType, string> = {
  cuti: "#2563eb",
  izin: "#8b5cf6",
  sakit: "#f43f5e",
  dinas_dalam: "#0891b2",
  dinas_luar: "#7c3aed",
  pengecualian_apel: "#64748b",
};

const MONTH_FMT = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", month: "short", year: "2-digit" });
const monthLabel = (key: string) => MONTH_FMT.format(new Date(`${key}-01T00:00:00Z`));

export function TypeLegend({ types }: { types: LeaveType[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {types.map((t) => (
        <li key={t} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LEAVE_COLORS[t] }} />
          {LEAVE_TYPE_SHORT_LABEL[t]}
        </li>
      ))}
    </ul>
  );
}

/** Batang horizontal: jumlah pengajuan & jumlah pegawai per jenis. */
export function TypeBars({ data }: { data: LeaveStats["byType"] }) {
  const max = Math.max(1, ...data.map((d) => d.requests));
  if (data.length === 0) return <p className="text-sm text-slate-400">Belum ada data.</p>;
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.type}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-slate-700">{LEAVE_TYPE_SHORT_LABEL[d.type]}</span>
            <span className="text-xs text-slate-500">
              <strong className="text-slate-800">{d.requests}</strong> pengajuan · {d.employees} pegawai
            </span>
          </div>
          <div className="mt-1 h-3 rounded bg-slate-100">
            <div className="h-3 rounded" style={{ width: `${(d.requests / max) * 100}%`, background: LEAVE_COLORS[d.type] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Kolom bertumpuk per bulan (berdasarkan tanggal mulai pengajuan). */
export function MonthlyStack({ data, types }: { data: LeaveStats["byMonth"]; types: LeaveType[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const H = 140;
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-end gap-2 pt-5" role="img" aria-label="Grafik jumlah pengajuan per bulan">
        {data.map((m) => (
          <div key={m.key} className="flex w-11 flex-col items-center gap-1">
            <span className="text-[11px] font-semibold text-slate-700">{m.total || ""}</span>
            <div className="flex flex-col-reverse justify-start overflow-hidden rounded-t" style={{ height: H, width: 26 }}>
              {types.map((t) =>
                m.counts[t] > 0 ? (
                  <div
                    key={t}
                    title={`${LEAVE_TYPE_SHORT_LABEL[t]}: ${m.counts[t]}`}
                    style={{ height: (m.counts[t] / max) * H, background: LEAVE_COLORS[t] }}
                  />
                ) : null
              )}
            </div>
            <span className="text-[10px] text-slate-500">{monthLabel(m.key)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pegawai dengan pengajuan terbanyak, batang bertumpuk per jenis. */
export function TopEmployeesBars({ data, types, limit = 10 }: { data: LeaveStats["perEmployee"]; types: LeaveType[]; limit?: number }) {
  const top = data.slice(0, limit);
  const max = Math.max(1, ...top.map((d) => d.total));
  if (top.length === 0) return <p className="text-sm text-slate-400">Belum ada data.</p>;
  return (
    <div className="space-y-2">
      {top.map((d) => (
        <div key={d.employee.id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-sm sm:grid-cols-[minmax(0,13rem)_1fr_auto]">
          <span className="truncate text-slate-700" title={d.employee.full_name}>
            {d.employee.full_name}
          </span>
          <div className="flex h-4 overflow-hidden rounded bg-slate-100">
            {types.map((t) =>
              d.counts[t] > 0 ? (
                <div
                  key={t}
                  title={`${LEAVE_TYPE_SHORT_LABEL[t]}: ${d.counts[t]}`}
                  style={{ width: `${(d.counts[t] / max) * 100}%`, background: LEAVE_COLORS[t] }}
                />
              ) : null
            )}
          </div>
          <span className="w-8 text-right font-semibold tabular-nums text-slate-800">{d.total}</span>
        </div>
      ))}
    </div>
  );
}

/** Sebaran: berapa pegawai yang mengajukan 0x, 1x, 2x, ... */
export function FrequencyBars({ data, eligible }: { data: LeaveStats["frequency"]; eligible: number }) {
  const max = Math.max(1, ...data.map((d) => d.employees));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-sm">
          <span className="text-slate-600">{d.label}</span>
          <div className="h-3 rounded bg-slate-100">
            <div className="h-3 rounded bg-teal-600" style={{ width: `${(d.employees / max) * 100}%` }} />
          </div>
          <span className="w-24 text-right text-xs text-slate-500">
            <strong className="text-slate-800">{d.employees}</strong> pegawai
            {eligible > 0 ? ` (${Math.round((d.employees / eligible) * 100)}%)` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

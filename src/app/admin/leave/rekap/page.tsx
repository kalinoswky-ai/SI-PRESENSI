import Link from "next/link";
import { Download, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { LEAVE_TYPE_SHORT_LABEL } from "@/types";
import {
  REKAP_STATUS_OPTIONS,
  REKAP_TYPE_OPTIONS,
  computeLeaveStats,
  parseRekapParams,
  typesForFilter,
  type RekapEmployee,
  type RekapLeaveRow,
} from "@/lib/reports/leaveStats";
import { FrequencyBars, MonthlyStack, TopEmployeesBars, TypeBars, TypeLegend } from "@/components/admin-leave/LeaveCharts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DT = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const fmt = (d: string) => DT.format(new Date(`${d}T00:00:00+08:00`));

export default async function LeaveRekapPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const params = parseRekapParams((k) => searchParams[k]);
  const types = typesForFilter(params.type);
  const supabase = createClient();

  const [{ data: rows, error }, { data: employees, error: empError }] = await Promise.all([
    fetchAllRows<RekapLeaveRow>((a, b) => {
      let q = supabase
        .from("leave_requests")
        .select("id, employee_id, type, status, start_date, end_date, reason, destination, created_at")
        .gte("start_date", params.from)
        .lte("start_date", params.to)
        .in("type", types);
      if (params.status !== "all") q = q.eq("status", params.status);
      return q.order("start_date", { ascending: false }).order("id").range(a, b);
    }),
    fetchAllRows<RekapEmployee>((a, b) =>
      supabase.from("employees").select("id, full_name, nip, position, is_active, role").order("full_name").order("id").range(a, b)
    ),
  ]);

  const stats = computeLeaveStats(rows, employees, params);
  const qs = new URLSearchParams({ from: params.from, to: params.to, type: params.type, status: params.status, min: String(params.min) });
  const exportHref = `/api/leave/export?${qs.toString()}`;

  const cards = [
    { label: "Total pengajuan", value: stats.totalRequests, hint: `${fmt(params.from)} – ${fmt(params.to)}` },
    {
      label: "Pegawai yang mengajukan",
      value: stats.distinctEmployees,
      hint: `dari ${stats.eligibleEmployees} pegawai wajib absen${stats.participationPct === null ? "" : ` (${stats.participationPct}%)`}`,
    },
    { label: `Sering mengajukan (≥ ${params.min}x)`, value: stats.frequentCount, hint: "pegawai" },
    { label: "Hari kerja terpakai", value: stats.totalWorkdays, hint: "pengajuan disetujui, Sen–Jum" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/leave" className="text-xs font-medium text-brand-600 hover:underline">
          ← Semua folder Time Off
        </Link>
        <h1 className="mt-1 text-lg font-bold text-slate-900">Rekap &amp; Grafik Pengajuan</h1>
        <p className="text-sm text-slate-500">
          Pemetaan pegawai yang mengajukan cuti, izin, sakit, dan dinas — siapa yang paling sering dan seberapa banyak
          pegawai yang mengajukan. Periode dihitung dari tanggal mulai pengajuan.
        </p>
      </div>

      <form method="get" className="card grid gap-3 sm:grid-cols-6">
        <div className="sm:col-span-1">
          <label className="label">Dari</label>
          <input type="date" name="from" defaultValue={params.from} className="input" />
        </div>
        <div className="sm:col-span-1">
          <label className="label">Sampai</label>
          <input type="date" name="to" defaultValue={params.to} className="input" />
        </div>
        <div className="sm:col-span-1">
          <label className="label">Jenis</label>
          <select name="type" defaultValue={params.type} className="input">
            <option value="all">Semua (tanpa pengecualian apel)</option>
            {REKAP_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {LEAVE_TYPE_SHORT_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-1">
          <label className="label">Status</label>
          <select name="status" defaultValue={params.status} className="input">
            {REKAP_STATUS_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-1">
          <label className="label">Sering = min. (x)</label>
          <input type="number" name="min" min={2} max={50} defaultValue={params.min} className="input" />
        </div>
        <div className="flex items-end gap-2 sm:col-span-1">
          <button type="submit" className="btn-primary">
            Terapkan
          </button>
        </div>
      </form>

      {(error || empError) && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">Gagal memuat data: {error ?? empError}</p>
      )}

      <div className="flex justify-end">
        <a href={exportHref} className="btn-secondary" download>
          <Download size={16} />
          Unduh Excel
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{c.value}</p>
            <p className="text-xs text-slate-400">{c.hint}</p>
          </div>
        ))}
      </div>

      {stats.totalRequests === 0 ? (
        <p className="card text-sm text-slate-500">Tidak ada pengajuan pada filter ini. Ubah periode, jenis, atau status.</p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card space-y-3">
              <h2 className="font-semibold text-slate-800">Pengajuan per jenis</h2>
              <TypeBars data={stats.byType} />
            </section>
            <section className="card space-y-3">
              <h2 className="flex items-center gap-1.5 font-semibold text-slate-800">
                <Users size={16} /> Berapa pegawai mengajukan berapa kali
              </h2>
              <FrequencyBars data={stats.frequency} eligible={stats.eligibleEmployees} />
            </section>
          </div>

          <section className="card space-y-3">
            <h2 className="font-semibold text-slate-800">Tren pengajuan per bulan</h2>
            <TypeLegend types={types} />
            <MonthlyStack data={stats.byMonth} types={types} />
          </section>

          <section className="card space-y-3">
            <h2 className="font-semibold text-slate-800">10 pegawai paling sering mengajukan</h2>
            <TypeLegend types={types} />
            <TopEmployeesBars data={stats.perEmployee} types={types} />
          </section>

          <section className="card space-y-3">
            <h2 className="font-semibold text-slate-800">Pemetaan per pegawai ({stats.perEmployee.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Pegawai</th>
                    {types.map((t) => (
                      <th key={t} className="px-2 py-2 text-center">
                        {LEAVE_TYPE_SHORT_LABEL[t]}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-center">Total</th>
                    <th className="px-2 py-2 text-center">Hari kerja</th>
                    <th className="py-2 pl-2">Terakhir</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.perEmployee.map((e, i) => (
                    <tr key={e.employee.id} className="border-b border-slate-100">
                      <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                      <td className="py-2 pr-2">
                        <p className="font-medium text-slate-800">
                          {e.employee.full_name}
                          {e.frequent && (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                              Sering
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400">
                          {e.employee.nip ?? "-"}
                          {e.employee.position ? ` · ${e.employee.position}` : ""}
                        </p>
                      </td>
                      {types.map((t) => (
                        <td key={t} className="px-2 py-2 text-center tabular-nums text-slate-600">
                          {e.counts[t] || "–"}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center font-semibold tabular-nums text-slate-900">{e.total}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-slate-600">{e.workdays}</td>
                      <td className="py-2 pl-2 text-xs text-slate-500">{fmt(e.lastStart)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400">
              Hari kerja dihitung Senin–Jumat dari pengajuan berstatus <strong>Disetujui</strong> (libur nasional tidak
              dikurangkan). Pengajuan Dibatalkan, Ditolak, dan Menunggu dihitung sebagai pengajuan tetapi bernilai 0 hari.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

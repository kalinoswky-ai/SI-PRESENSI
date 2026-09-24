import { createClient } from "@/lib/supabase/server";
import { formatWita } from "@/lib/geo";
import { Download, Users, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

// Selalu render ulang & ambil data terbaru dari Supabase — jangan di-cache Next.js.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const supabase = createClient();
  const from = searchParams.from || firstOfMonthStr();
  const to = searchParams.to || todayStr();

  const [{ data: employees }, { data: records }] = await Promise.all([
    supabase.from("employees").select("id, full_name, nip, position").eq("is_active", true).order("full_name"),
    supabase
      .from("attendance")
      .select("employee_id, type, status, is_late")
      .gte("server_time", `${from}T00:00:00.000Z`)
      .lte("server_time", `${to}T23:59:59.999Z`),
  ]);

  const rows = (records ?? []) as { employee_id: string; type: string; status: string; is_late: boolean }[];

  const totalValid = rows.filter((r) => r.status === "valid" && r.type === "in").length;
  const totalLate = rows.filter((r) => r.status === "valid" && r.type === "in" && r.is_late).length;
  const totalRejected = rows.filter((r) => r.status === "rejected").length;

  const perEmployee = (employees ?? []).map((e) => {
    const mine = rows.filter((r) => r.employee_id === e.id);
    const hadir = mine.filter((r) => r.status === "valid" && r.type === "in").length;
    const telat = mine.filter((r) => r.status === "valid" && r.type === "in" && r.is_late).length;
    const ditolak = mine.filter((r) => r.status === "rejected").length;
    return { ...e, hadir, telat, ditolak };
  });

  const exportParams = new URLSearchParams({ from, to });

  const pct = (n: number) => (totalValid + totalRejected === 0 ? 0 : Math.round((n / (totalValid + totalRejected)) * 100));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Laporan (Reports)</h1>
          <p className="text-sm text-slate-500">Rekapitulasi kehadiran per pegawai pada rentang tanggal terpilih.</p>
        </div>
        <a href={`/api/attendance/export?${exportParams.toString()}`} className="btn-primary">
          <Download size={18} />
          Export Excel
        </a>
      </div>

      <form className="card flex flex-wrap items-end gap-3" method="get">
        <div>
          <label className="label">Dari Tanggal</label>
          <input type="date" name="from" defaultValue={from} className="input" />
        </div>
        <div>
          <label className="label">Sampai Tanggal</label>
          <input type="date" name="to" defaultValue={to} className="input" />
        </div>
        <button type="submit" className="btn-secondary">Terapkan</button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <Users className="text-brand-600" size={22} />
          <p className="mt-3 text-2xl font-bold text-slate-900">{employees?.length ?? 0}</p>
          <p className="text-sm text-slate-500">Pegawai Aktif</p>
        </div>
        <div className="card">
          <CheckCircle2 className="text-emerald-600" size={22} />
          <p className="mt-3 text-2xl font-bold text-slate-900">{totalValid}</p>
          <p className="text-sm text-slate-500">Absen Masuk Valid</p>
        </div>
        <div className="card">
          <AlertTriangle className="text-amber-600" size={22} />
          <p className="mt-3 text-2xl font-bold text-slate-900">{totalLate}</p>
          <p className="text-sm text-slate-500">Terlambat</p>
        </div>
        <div className="card">
          <XCircle className="text-red-500" size={22} />
          <p className="mt-3 text-2xl font-bold text-slate-900">{totalRejected}</p>
          <p className="text-sm text-slate-500">Ditolak (lokasi/wajah)</p>
        </div>
      </div>

      <div className="card space-y-3">
        <p className="text-sm font-semibold text-slate-800">Proporsi Absen Valid vs Ditolak</p>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="bg-emerald-500" style={{ width: `${pct(totalValid)}%` }} />
          <div className="bg-red-400" style={{ width: `${pct(totalRejected)}%` }} />
        </div>
        <div className="flex gap-4 text-xs text-slate-500">
          <span><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Valid ({pct(totalValid)}%)</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-red-400" /> Ditolak ({pct(totalRejected)}%)</span>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Pegawai</th>
              <th className="px-4 py-3">Hadir</th>
              <th className="px-4 py-3">Terlambat</th>
              <th className="px-4 py-3">Ditolak</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {perEmployee.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{e.full_name}</p>
                  <p className="text-xs text-slate-500">{e.nip}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{e.hadir}</td>
                <td className="px-4 py-3 text-amber-600">{e.telat}</td>
                <td className="px-4 py-3 text-red-500">{e.ditolak}</td>
              </tr>
            ))}
            {perEmployee.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  Belum ada data pegawai aktif.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Data dihitung dari waktu server ({formatWita(new Date())} WITA saat halaman ini dimuat). Untuk log
        mentah per absen (jam masuk/pulang, jarak, status wajah), buka menu <strong>Timesheets (Absensi)</strong>.
      </p>
    </div>
  );
}

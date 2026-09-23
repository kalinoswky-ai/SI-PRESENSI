import { createClient } from "@/lib/supabase/server";
import { formatWita } from "@/lib/geo";
import { Download, CheckCircle2, XCircle } from "lucide-react";
import AttendanceTabs from "../AttendanceTabs";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default async function AttendanceLogPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; employee_id?: string };
}) {
  const supabase = createClient();
  const from = searchParams.from || firstOfMonthStr();
  const to = searchParams.to || todayStr();

  const { data: employees } = await supabase
    .from("employees")
    .select("id, full_name, nip")
    .order("full_name");

  let query = supabase
    .from("attendance")
    .select("*, employees(full_name, nip, position)")
    .gte("server_time", `${from}T00:00:00.000Z`)
    .lte("server_time", `${to}T23:59:59.999Z`)
    .order("server_time", { ascending: false });

  if (searchParams.employee_id) {
    query = query.eq("employee_id", searchParams.employee_id);
  }

  const { data: records } = await query;

  const exportParams = new URLSearchParams({
    from,
    to,
    ...(searchParams.employee_id ? { employee_id: searchParams.employee_id } : {}),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Timesheets</h1>
        <p className="text-sm text-slate-500">Absensi — log mentah tiap kejadian absen.</p>
      </div>

      <AttendanceTabs active="log" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Log Absensi</h2>
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
        <div>
          <label className="label">Pegawai</label>
          <select name="employee_id" defaultValue={searchParams.employee_id ?? ""} className="input">
            <option value="">Semua Pegawai</option>
            {employees?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name} ({e.nip})
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Terapkan Filter</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Pegawai</th>
              <th className="px-4 py-3">Jenis</th>
              <th className="px-4 py-3">Waktu Server</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Jarak</th>
              <th className="px-4 py-3">Wajah</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{r.employees?.full_name}</p>
                  <p className="text-xs text-slate-500">{r.employees?.nip}</p>
                </td>
                <td className="px-4 py-3">
                  {r.type === "in" ? "Masuk" : "Pulang"}
                  {r.is_late && (
                    <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-xs text-amber-700">
                      Terlambat
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{formatWita(new Date(r.server_time))}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      r.work_mode === "wfh" ? "bg-emerald-50 text-emerald-700" : "bg-brand-50 text-brand-700"
                    }`}
                  >
                    {r.work_mode === "wfh" ? "WFH" : "WFO"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {r.work_mode === "wfh" ? "-" : `${Math.round(r.distance_meters)}m`}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {r.face_match ? (
                    <CheckCircle2 className="text-emerald-500" size={16} />
                  ) : (
                    <XCircle className="text-red-500" size={16} />
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      r.status === "valid" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                    }`}
                  >
                    {r.status === "valid" ? "Valid" : "Ditolak"}
                  </span>
                </td>
              </tr>
            ))}
            {(!records || records.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Tidak ada data absensi pada rentang ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

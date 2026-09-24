import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { getViewerProfile } from "@/lib/admin/auth";
import { witaDateKey } from "@/lib/geo";
import { Download } from "lucide-react";
import AttendanceTabs from "../AttendanceTabs";
import AttendanceLogTable from "./AttendanceLogTable";
import type { AttendanceRecord } from "@/types";

// Selalu render ulang & ambil data terbaru dari Supabase — jangan di-cache Next.js.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function firstOfMonthStr() {
  return `${witaDateKey(new Date()).slice(0, 8)}01`;
}

export default async function AttendanceLogPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; employee_id?: string };
}) {
  const supabase = createClient();
  const from = searchParams.from || firstOfMonthStr();
  const to = searchParams.to || witaDateKey(new Date());
  const viewer = await getViewerProfile();
  const isAdmin = viewer?.role === "admin";

  const [{ data: employees }, { data: office }, { data: records, error }] = await Promise.all([
    supabase.from("employees").select("id, full_name, nip").order("full_name"),
    supabase.from("offices").select("work_start, friday_hybrid").limit(1).single(),
    fetchAllRows<AttendanceRecord>((a, b) => {
      let q = supabase
        .from("attendance")
        .select("*, employees(full_name, nip, position)")
        .gte("server_time", `${from}T00:00:00+08:00`)
        .lte("server_time", `${to}T23:59:59.999+08:00`)
        .order("server_time", { ascending: false })
        .order("id");
      if (searchParams.employee_id) q = q.eq("employee_id", searchParams.employee_id);
      return q.range(a, b);
    }, { max: 5000 }),
  ]);

  const exportParams = new URLSearchParams({
    from,
    to,
    ...(searchParams.employee_id ? { employee_id: searchParams.employee_id } : {}),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Timesheets</h1>
        <p className="text-sm text-slate-500">
          {isAdmin
            ? "Absensi — log mentah tiap kejadian absen. Admin dapat mengoreksi (Edit) atau menghapus data yang salah; setiap perubahan tercatat di tab Riwayat Perubahan."
            : "Absensi — log mentah tiap kejadian absen pegawai (mode lihat saja)."}
        </p>
      </div>

      <AttendanceTabs active="log" readOnly={!isAdmin} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Log Absensi ({records.length})</h2>
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

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">Gagal memuat data: {error}</p>
      )}

      <AttendanceLogTable
        records={records}
        office={office ? { work_start: office.work_start as string, friday_hybrid: Boolean(office.friday_hybrid) } : null}
        readOnly={!isAdmin}
      />
    </div>
  );
}

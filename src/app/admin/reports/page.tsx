import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { getViewerProfile } from "@/lib/admin/auth";
import { formatWita, witaDateKey } from "@/lib/geo";
import Link from "next/link";
import { Download, Users, CheckCircle2, AlertTriangle, XCircle, Pencil } from "lucide-react";
import DeleteAttendanceRangeButton from "@/components/DeleteAttendanceRangeButton";

// Selalu render ulang & ambil data terbaru dari Supabase — jangan di-cache Next.js.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function firstOfMonthStr() {
  return `${witaDateKey(new Date()).slice(0, 8)}01`;
}
function todayStr() {
  return witaDateKey(new Date());
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const supabase = createClient();
  const from = searchParams.from || firstOfMonthStr();
  const to = searchParams.to || todayStr();
  const viewer = await getViewerProfile();
  const isAdmin = viewer?.role === "admin";

  // fetchAllRows: query biasa dibatasi 1000 baris oleh Supabase sehingga rekap bisa terpotong
  const [{ data: employees }, { data: records }] = await Promise.all([
    supabase.from("employees").select("id, full_name, nip, position").eq("is_active", true).order("full_name"),
    fetchAllRows<{ employee_id: string; type: string; status: string; is_late: boolean }>((a, b) =>
      supabase
        .from("attendance")
        .select("employee_id, type, status, is_late")
        .gte("server_time", `${from}T00:00:00+08:00`)
        .lte("server_time", `${to}T23:59:59.999+08:00`)
        .order("server_time", { ascending: true })
        .order("id")
        .range(a, b)
    ),
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
    return { ...e, hadir, telat, ditolak, total: mine.length };
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

      <div className="card max-h-[75vh] overflow-auto p-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-500 shadow-sm">
            <tr>
              <th className="px-4 py-3">Pegawai</th>
              <th className="px-4 py-3">Hadir</th>
              <th className="px-4 py-3">Terlambat</th>
              <th className="px-4 py-3">Ditolak</th>
              <th className="px-4 py-3 text-right">{isAdmin ? "Kelola Data" : "Detail"}</th>
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
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <Link
                    href={`/admin/attendance/log?employee_id=${e.id}&from=${from}&to=${to}`}
                    className="mr-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                  >
                    {isAdmin ? (
                      <>
                        <Pencil size={13} /> Edit
                      </>
                    ) : (
                      "Lihat Log"
                    )}
                  </Link>
                  {isAdmin && e.total > 0 && (
                    <DeleteAttendanceRangeButton
                      compact
                      label="Hapus"
                      from={from}
                      to={to}
                      count={e.total}
                      employeeId={e.id}
                      description={`Seluruh data absensi ${e.full_name}.`}
                    />
                  )}
                </td>
              </tr>
            ))}
            {perEmployee.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Belum ada data pegawai aktif.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && rows.length > 0 && (
        <div className="card space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Kelola Data Periode Ini</p>
            <p className="text-xs text-slate-500">
              Bersihkan data yang salah atau tidak diperlukan (mis. data uji coba). Setiap penghapusan wajib
              beralasan dan tercatat di Timesheets &gt; Riwayat Perubahan.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {totalRejected > 0 && (
              <DeleteAttendanceRangeButton
                label={`Hapus data Ditolak (${totalRejected})`}
                from={from}
                to={to}
                count={totalRejected}
                status="rejected"
                description="Seluruh data absensi berstatus Ditolak (semua pegawai)."
              />
            )}
            <DeleteAttendanceRangeButton
              label={`Hapus semua data periode (${rows.length})`}
              from={from}
              to={to}
              count={rows.length}
              description="SELURUH data absensi semua pegawai."
            />
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Data dihitung dari waktu server ({formatWita(new Date())} WITA saat halaman ini dimuat). Untuk log
        mentah per absen (jam masuk/pulang, jarak, status wajah), buka menu <strong>Timesheets (Absensi)</strong>.
      </p>
    </div>
  );
}

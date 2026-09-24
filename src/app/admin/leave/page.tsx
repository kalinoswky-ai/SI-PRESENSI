import { createClient } from "@/lib/supabase/server";
import { LEAVE_TYPE_LABEL } from "@/types";
import type { LeaveRequest } from "@/types";
import LeaveActions from "./LeaveActions";

// Selalu baca data terbaru dari Supabase (jangan di-cache Next.js).
export const dynamic = "force-dynamic";
export const revalidate = 0;

type EmployeeInfo = { id: string; full_name: string; nip: string | null; position: string | null };

const TABS = [
  { key: "pending", label: "Menunggu" },
  { key: "approved", label: "Disetujui" },
  { key: "rejected", label: "Ditolak" },
  { key: "all", label: "Semua" },
];

function formatDate(d: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(`${d}T00:00:00+08:00`)
  );
}

export default async function AdminLeavePage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const supabase = createClient();
  const status = TABS.some((t) => t.key === searchParams.status) ? searchParams.status! : "pending";

  // ROOT CAUSE bug "Time Off kosong": tabel leave_requests punya DUA foreign key ke employees
  // (employee_id = pemohon, reviewed_by = admin yang memproses). Query lama memakai embed
  // `employees(...)` tanpa petunjuk relasi, sehingga PostgREST menolaknya (PGRST201 — ambigu),
  // `data` menjadi null, dan halaman tampak "Tidak ada pengajuan" padahal datanya ada.
  // Solusi: ambil pengajuan & data pegawai lewat dua query terpisah, lalu gabungkan di sini.
  const { data: allRows, error: leaveError } = await supabase
    .from("leave_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (allRows ?? []) as LeaveRequest[];

  const employeeIds = Array.from(new Set(rows.map((r) => r.employee_id)));
  const employeeMap = new Map<string, EmployeeInfo>();
  let employeeError: string | null = null;
  if (employeeIds.length > 0) {
    const { data: emps, error } = await supabase
      .from("employees")
      .select("id, full_name, nip, position")
      .in("id", employeeIds);
    if (error) employeeError = error.message;
    (emps ?? []).forEach((e) => employeeMap.set(e.id, e as EmployeeInfo));
  }

  const counts: Record<string, number> = {
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    all: rows.length,
  };
  const records = status === "all" ? rows : rows.filter((r) => r.status === status);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">Pengajuan Cuti / Izin / Sakit</h1>

      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <a
            key={t.key}
            href={`/admin/leave?status=${t.key}`}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
              status === t.key ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${
                  t.key === "pending" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {counts[t.key]}
              </span>
            )}
          </a>
        ))}
      </div>

      {leaveError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          Gagal memuat pengajuan dari database: {leaveError.message}
        </p>
      )}
      {employeeError && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Data nama pegawai tidak dapat dimuat sebagian: {employeeError}
        </p>
      )}

      {!leaveError && records.length === 0 && (
        <p className="text-sm text-slate-500">Tidak ada pengajuan pada kategori ini.</p>
      )}

      <div className="space-y-2">
        {records.map((r) => {
          const emp = employeeMap.get(r.employee_id);
          return (
            <div key={r.id} className="card space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-800">
                    {emp?.full_name ?? "Pegawai tidak dikenal"}{" "}
                    <span className="font-normal text-slate-400">· {emp?.nip ?? "-"}</span>
                  </p>
                  <p className="text-sm text-slate-500">
                    {LEAVE_TYPE_LABEL[r.type]} · {formatDate(r.start_date)}
                    {r.end_date !== r.start_date ? ` s/d ${formatDate(r.end_date)}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{r.reason}</p>
                  {r.attachment_url && (
                    <a
                      href={`/api/leave/attachment?path=${encodeURIComponent(r.attachment_url)}`}
                      className="mt-1 inline-block text-xs text-brand-600 hover:underline"
                    >
                      Lihat Lampiran
                    </a>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${
                    r.status === "pending"
                      ? "bg-amber-50 text-amber-700"
                      : r.status === "approved"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-600"
                  }`}
                >
                  {r.status === "pending" ? "Menunggu" : r.status === "approved" ? "Disetujui" : "Ditolak"}
                </span>
              </div>

              {r.status === "pending" && <LeaveActions id={r.id} />}
              {r.status !== "pending" && r.review_note && (
                <p className="text-xs text-slate-400">Catatan: {r.review_note}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

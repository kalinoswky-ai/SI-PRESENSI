import { createClient } from "@/lib/supabase/server";
import { getLeaveApprover } from "@/lib/admin/auth";
import { formatDurationMinutes, witaDateKey } from "@/lib/geo";
import type { OvertimeRequest } from "@/types";
import { Download } from "lucide-react";
import OvertimeActions from "./OvertimeActions";

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

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function formatDate(d: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(`${d}T00:00:00+08:00`)
  );
}

export default async function AdminOvertimePage({
  searchParams,
}: {
  searchParams: { status?: string; month?: string };
}) {
  const supabase = createClient();
  const status = TABS.some((t) => t.key === searchParams.status) ? searchParams.status! : "pending";
  const month = searchParams.month && MONTH_RE.test(searchParams.month) ? searchParams.month : witaDateKey(new Date()).slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  // Hanya Inspektur yang dapat menyetujui/menolak; Admin & Sekretaris mode lihat saja.
  const canApprove = (await getLeaveApprover()) !== null;

  const { data: allRows, error: overtimeError } = await supabase
    .from("overtime_requests")
    .select("*")
    .gte("work_date", from)
    .lt("work_date", next)
    .order("work_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);

  const rows = (allRows ?? []) as OvertimeRequest[];

  // Pengajuan menunggu dari bulan lain tetap harus terlihat agar tidak terlewat.
  const { data: pendingOther } = await supabase
    .from("overtime_requests")
    .select("*")
    .eq("status", "pending")
    .or(`work_date.lt.${from},work_date.gte.${next}`)
    .order("work_date", { ascending: false })
    .limit(200);
  const pendingElsewhere = (pendingOther ?? []) as OvertimeRequest[];

  const allForNames = [...rows, ...pendingElsewhere];
  const employeeIds = Array.from(new Set(allForNames.map((r) => r.employee_id)));
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
    pending: rows.filter((r) => r.status === "pending").length + pendingElsewhere.length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    all: rows.length,
  };

  const listed =
    status === "all"
      ? rows
      : status === "pending"
      ? [...pendingElsewhere, ...rows.filter((r) => r.status === "pending")]
      : rows.filter((r) => r.status === status);

  const approvedMinutes = rows.filter((r) => r.status === "approved").reduce((s, r) => s + r.duration_minutes, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Lembur</h1>
          {!canApprove && (
            <p className="text-sm text-slate-500">Mode lihat saja — persetujuan/penolakan hanya dilakukan oleh Inspektur.</p>
          )}
        </div>
        <form method="get" className="flex items-end gap-2">
          <input type="hidden" name="status" value={status} />
          <div>
            <label className="label">Bulan</label>
            <input type="month" name="month" defaultValue={month} className="input" />
          </div>
          <button type="submit" className="btn-secondary">
            Tampilkan
          </button>
          <a href={`/api/overtime/export?month=${month}`} className="btn-secondary">
            <Download size={16} />
            Export Excel
          </a>
        </form>
      </div>

      <div className="card flex items-center justify-between">
        <p className="text-sm text-slate-600">Total lembur disetujui bulan {month}</p>
        <p className="text-lg font-bold text-brand-700">{formatDurationMinutes(approvedMinutes)}</p>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <a
            key={t.key}
            href={`/admin/overtime?status=${t.key}&month=${month}`}
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

      {overtimeError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          Gagal memuat pengajuan lembur: {overtimeError.message}. Pastikan file supabase/update-lembur.sql sudah dijalankan
          di Supabase SQL Editor.
        </p>
      )}
      {employeeError && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Data nama pegawai tidak dapat dimuat sebagian: {employeeError}
        </p>
      )}

      {!overtimeError && listed.length === 0 && (
        <p className="text-sm text-slate-500">Tidak ada pengajuan lembur pada kategori ini.</p>
      )}

      <div className="space-y-2">
        {listed.map((r) => {
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
                    {formatDate(r.work_date)} · {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)} WITA ·{" "}
                    {formatDurationMinutes(r.duration_minutes)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{r.description}</p>
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

              {r.status === "pending" && canApprove && <OvertimeActions id={r.id} />}
              {r.status === "pending" && !canApprove && (
                <p className="text-xs font-medium text-amber-600">Menunggu persetujuan Inspektur.</p>
              )}
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

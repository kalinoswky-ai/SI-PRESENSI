import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCorrectionApprover, requireAdminOrPimpinan } from "@/lib/admin/auth";
import { CORRECTION_TYPE_LABEL } from "@/types";
import type { AttendanceCorrection, AttendanceRecord } from "@/types";
import { formatWita } from "@/lib/geo";
import { groupByDay } from "@/lib/employee/history";
import { formatTime } from "@/lib/employee/history";
import { Paperclip } from "lucide-react";
import CorrectionActions from "./CorrectionActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABS = [
  { key: "pending", label: "Menunggu" },
  { key: "approved", label: "Disetujui" },
  { key: "rejected", label: "Ditolak" },
  { key: "all", label: "Semua" },
];
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
};
const STATUS_LABEL: Record<string, string> = { pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak" };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type EmployeeInfo = { id: string; full_name: string; nip: string | null; position: string | null };
type AuditRow = { target_id: string; action: string; actor_name: string | null; created_at: string; reason: string | null; old_data: any; new_data: any };

const fmtTime = (iso?: string | null) => (iso ? formatTime(iso) : "—");

export default async function CorrectionsPage({
  searchParams,
}: {
  searchParams: { status?: string; from?: string; to?: string };
}) {
  const viewer = await requireAdminOrPimpinan();
  if (!viewer) return <p className="text-sm text-red-600">Anda tidak berwenang membuka halaman ini.</p>;

  const supabase = createClient();
  const status = TABS.some((t) => t.key === searchParams.status) ? searchParams.status! : "pending";
  const from = searchParams.from && DATE_RE.test(searchParams.from) ? searchParams.from : "";
  const to = searchParams.to && DATE_RE.test(searchParams.to) ? searchParams.to : "";
  const canDecide = (await getCorrectionApprover()) !== null;

  // Dua query terpisah (bukan embed) — mengikuti pola halaman Time Off agar bebas dari
  // ambiguitas relasi ganda ke tabel employees.
  let query = supabase.from("attendance_corrections").select("*").order("created_at", { ascending: false }).limit(300);
  if (status !== "all") query = query.eq("status", status);
  if (from) query = query.gte("work_date", from);
  if (to) query = query.lte("work_date", to);
  const { data, error } = await query;
  const rows = (data ?? []) as AttendanceCorrection[];

  const empIds = Array.from(new Set(rows.flatMap((r) => [r.employee_id, r.reviewed_by].filter(Boolean) as string[])));
  const emps = new Map<string, EmployeeInfo>();
  const dayAttendance = new Map<string, ReturnType<typeof groupByDay>[number]>(); // "empId|date"
  const audits = new Map<string, AuditRow[]>();

  if (rows.length > 0) {
    const { data: empRows } = await supabase.from("employees").select("id, full_name, nip, position").in("id", empIds);
    for (const e of (empRows ?? []) as EmployeeInfo[]) emps.set(e.id, e);

    // Absensi hari yang bersangkutan (kondisi SAAT INI) agar pemeriksa melihat data resmi vs jam yang diajukan.
    const dates = rows.map((r) => r.work_date).sort();
    const { data: attRows } = await supabase
      .from("attendance")
      .select("*")
      .in("employee_id", Array.from(new Set(rows.map((r) => r.employee_id))))
      .gte("server_time", `${dates[0]}T00:00:00+08:00`)
      .lt("server_time", `${new Date(new Date(`${dates[dates.length - 1]}T00:00:00Z`).getTime() + 2 * 86400000).toISOString().slice(0, 10)}T00:00:00+08:00`);
    const byEmp = new Map<string, AttendanceRecord[]>();
    for (const a of (attRows ?? []) as AttendanceRecord[]) {
      if (!byEmp.has(a.employee_id)) byEmp.set(a.employee_id, []);
      byEmp.get(a.employee_id)!.push(a);
    }
    byEmp.forEach((list, empId) => {
      for (const d of groupByDay(list)) dayAttendance.set(`${empId}|${d.key}`, d);
    });

    // Riwayat perubahan dari audit_log. audit_log hanya terbaca lewat service role (RLS: admin saja),
    // jadi dibaca di server dan hanya ditampilkan ke Admin/Pimpinan yang sudah lolos pengecekan di atas.
    try {
      const { data: auditRows } = await createAdminClient()
        .from("audit_log")
        .select("target_id, action, actor_name, created_at, reason, old_data, new_data")
        .in("action", ["correction.approve", "correction.reject"])
        .in("target_id", rows.map((r) => r.id))
        .order("created_at", { ascending: false });
      for (const a of (auditRows ?? []) as AuditRow[]) {
        if (!audits.has(a.target_id)) audits.set(a.target_id, []);
        audits.get(a.target_id)!.push(a);
      }
    } catch {
      // riwayat tidak tersedia (mis. env belum lengkap) — daftar pengajuan tetap tampil
    }
  }

  const qs = (s: string) => {
    const p = new URLSearchParams();
    p.set("status", s);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return `/admin/corrections?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Koreksi Absensi</h1>
        <p className="text-sm text-slate-500">
          Pengajuan koreksi absen masuk/pulang dari pegawai.{" "}
          {canDecide ? "Menyetujui akan mengubah data absensi resmi." : "Anda hanya dapat melihat (tidak berwenang menyetujui)."}
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          Gagal memuat data: {error.message}. Pastikan <code>supabase/update-koreksi-absensi.sql</code> sudah dijalankan.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={qs(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              status === t.key ? "bg-gradient-to-r from-brand-600 to-emerald-600 text-white" : "bg-white/70 text-slate-600"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3 !p-3">
        <input type="hidden" name="status" value={status} />
        <div>
          <label className="label" htmlFor="f-from">Tanggal absensi dari</label>
          <input id="f-from" type="date" name="from" defaultValue={from} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="f-to">sampai</label>
          <input id="f-to" type="date" name="to" defaultValue={to} className="input" />
        </div>
        <button type="submit" className="btn-secondary">Terapkan</button>
        {(from || to) && (
          <Link href={qs(status).replace(/&(from|to)=[^&]*/g, "")} className="text-sm text-brand-600 underline">
            Reset tanggal
          </Link>
        )}
      </form>

      {!error && rows.length === 0 && <p className="text-sm text-slate-500">Tidak ada pengajuan koreksi.</p>}

      <div className="space-y-3">
        {rows.map((r) => {
          const emp = emps.get(r.employee_id);
          const reviewer = r.reviewed_by ? emps.get(r.reviewed_by) : null;
          const day = dayAttendance.get(`${r.employee_id}|${r.work_date}`);
          const current = r.type === "in" ? day?.firstIn : day?.lastOut;
          const history = audits.get(r.id) ?? [];
          return (
            <div key={r.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{emp?.full_name ?? "—"}</p>
                  <p className="text-xs text-slate-500">
                    {[emp?.nip, emp?.position].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <span className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>

              <dl className="grid gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-slate-500">Tanggal absensi</dt>
                  <dd className="font-medium text-slate-800">{r.work_date}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Jenis koreksi</dt>
                  <dd className="font-medium text-slate-800">{CORRECTION_TYPE_LABEL[r.type]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Jam tercatat sekarang</dt>
                  <dd className="font-medium tabular-nums text-slate-800">{fmtTime(current?.server_time)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Jam diajukan</dt>
                  <dd className="font-semibold tabular-nums text-brand-700">{r.requested_time.slice(0, 5)} WITA</dd>
                </div>
              </dl>
              {day && (
                <p className="text-xs text-slate-500">
                  Absensi hari itu: masuk {fmtTime(day.firstIn?.server_time)}, pulang {fmtTime(day.lastOut?.server_time)}
                </p>
              )}

              <p className="text-sm text-slate-700">
                <span className="text-xs text-slate-500">Alasan pegawai: </span>
                {r.reason}
              </p>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span>Diajukan {formatWita(new Date(r.created_at))}</span>
                {r.attachment_url && (
                  <a
                    href={`/api/leave/attachment?path=${encodeURIComponent(r.attachment_url)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-brand-600"
                  >
                    <Paperclip size={12} /> Lihat bukti
                  </a>
                )}
              </div>

              {r.status !== "pending" && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {STATUS_LABEL[r.status]} oleh {reviewer?.full_name ?? "—"}
                  {r.reviewed_at ? ` · ${formatWita(new Date(r.reviewed_at))}` : ""}
                  {r.review_note ? ` — Alasan keputusan: ${r.review_note}` : ""}
                </p>
              )}

              {history.length > 0 && (
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer text-brand-600">Riwayat perubahan ({history.length})</summary>
                  <ul className="mt-2 space-y-1">
                    {history.map((h, i) => (
                      <li key={i} className="rounded bg-slate-50 px-2 py-1">
                        {formatWita(new Date(h.created_at))} · {h.actor_name ?? "-"} ·{" "}
                        {h.action === "correction.approve" ? "Disetujui" : "Ditolak"}
                        {h.action === "correction.approve" &&
                          ` — absensi ${h.old_data?.server_time ? fmtTime(h.old_data.server_time) : "(belum ada)"} → ${fmtTime(
                            h.new_data?.server_time
                          )}${h.new_data?.mode === "insert" ? " (data absensi baru dibuat)" : ""}`}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {r.status === "pending" && canDecide && <CorrectionActions id={r.id} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

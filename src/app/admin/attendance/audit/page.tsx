import { createClient } from "@/lib/supabase/server";
import { formatWita } from "@/lib/geo";
import AttendanceTabs from "../AttendanceTabs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACTION_LABEL: Record<string, { text: string; cls: string }> = {
  "attendance.update": { text: "Edit absensi", cls: "bg-violet-50 text-violet-700" },
  "attendance.delete": { text: "Hapus absensi", cls: "bg-red-50 text-red-600" },
  "attendance.bulk_delete": { text: "Hapus massal absensi", cls: "bg-red-50 text-red-600" },
  "employee.update": { text: "Edit pegawai", cls: "bg-violet-50 text-violet-700" },
  "employee.delete": { text: "Hapus pegawai", cls: "bg-red-50 text-red-600" },
  "employee.delete_failed": { text: "Hapus pegawai gagal", cls: "bg-amber-50 text-amber-700" },
};

interface AuditRow {
  id: string;
  actor_name: string | null;
  action: string;
  target_label: string | null;
  reason: string | null;
  old_data: unknown;
  new_data: unknown;
  created_at: string;
}

export default async function AuditPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, actor_name, action, target_label, reason, old_data, new_data, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as AuditRow[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Timesheets</h1>
        <p className="text-sm text-slate-500">
          Riwayat Perubahan — jejak audit seluruh koreksi &amp; penghapusan data oleh Admin (300 terbaru).
        </p>
      </div>

      <AttendanceTabs active="audit" />

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          Riwayat belum dapat dimuat: {error.message}. Jalankan{" "}
          <code>supabase/update-kelola-data-audit.sql</code> di Supabase SQL Editor.
        </p>
      )}

      {!error && rows.length === 0 && (
        <p className="text-sm text-slate-500">Belum ada perubahan data yang tercatat.</p>
      )}

      <div className="space-y-2">
        {rows.map((r) => {
          const meta = ACTION_LABEL[r.action] ?? { text: r.action, cls: "bg-slate-100 text-slate-600" };
          const hasDetail = r.old_data !== null || r.new_data !== null;
          return (
            <div key={r.id} className="card space-y-1 !p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.text}</span>
                <span className="text-xs text-slate-400">
                  {formatWita(new Date(r.created_at))} · oleh {r.actor_name ?? "-"}
                </span>
              </div>
              <p className="text-sm font-medium text-slate-800">{r.target_label ?? "-"}</p>
              {r.reason && <p className="text-sm text-slate-600">Alasan: {r.reason}</p>}
              {hasDetail && (
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer text-brand-600">Lihat detail data</summary>
                  {r.old_data !== null && (
                    <>
                      <p className="mt-2 font-semibold">Sebelum</p>
                      <pre className="max-h-56 overflow-auto rounded bg-slate-50 p-2">
                        {JSON.stringify(r.old_data, null, 2)}
                      </pre>
                    </>
                  )}
                  {r.new_data !== null && (
                    <>
                      <p className="mt-2 font-semibold">Sesudah</p>
                      <pre className="max-h-56 overflow-auto rounded bg-slate-50 p-2">
                        {JSON.stringify(r.new_data, null, 2)}
                      </pre>
                    </>
                  )}
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

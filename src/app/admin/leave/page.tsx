import { createClient } from "@/lib/supabase/server";
import { LEAVE_TYPE_LABEL } from "@/types";
import LeaveActions from "./LeaveActions";

// PENTING: tanpa ini, Next.js bisa meng-cache hasil query Supabase di halaman ini,
// sehingga pengajuan cuti/izin/sakit BARU dari pegawai tidak langsung muncul di sini
// walaupun datanya sudah tersimpan di database (root cause bug "Time Off" tidak terbarui).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLeavePage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const supabase = createClient();
  const status = searchParams.status || "pending";

  let query = supabase
    .from("leave_requests")
    .select("*, employees(full_name, nip, position)")
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data: records } = await query;

  const tabs = [
    { key: "pending", label: "Menunggu" },
    { key: "approved", label: "Disetujui" },
    { key: "rejected", label: "Ditolak" },
    { key: "all", label: "Semua" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-900">Pengajuan Cuti / Izin / Sakit</h1>

      <div className="flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={`/admin/leave?status=${t.key}`}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
              status === t.key ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      {(!records || records.length === 0) && (
        <p className="text-sm text-slate-500">Tidak ada pengajuan pada kategori ini.</p>
      )}

      <div className="space-y-2">
        {records?.map((r) => (
          <div key={r.id} className="card space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-800">
                  {r.employees?.full_name} <span className="font-normal text-slate-400">· {r.employees?.nip}</span>
                </p>
                <p className="text-sm text-slate-500">
                  {LEAVE_TYPE_LABEL[r.type as keyof typeof LEAVE_TYPE_LABEL]} · {r.start_date} s/d {r.end_date}
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
        ))}
      </div>
    </div>
  );
}

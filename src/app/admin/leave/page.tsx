import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LEAVE_TYPE_LABEL } from "@/types";
import type { LeaveType } from "@/types";
import { FolderOpen } from "lucide-react";

// Selalu baca data terbaru dari Supabase (jangan di-cache Next.js).
export const dynamic = "force-dynamic";
export const revalidate = 0;

const FOLDERS: { type: LeaveType; desc: string }[] = [
  { type: "cuti", desc: "Pengajuan cuti pegawai" },
  { type: "izin", desc: "Pengajuan izin pegawai" },
  { type: "sakit", desc: "Pengajuan sakit pegawai" },
];

export default async function AdminLeaveFoldersPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .select("type, status")
    .limit(2000);

  const rows = (data ?? []) as { type: LeaveType; status: "pending" | "approved" | "rejected" }[];
  const stat = (t: LeaveType) => ({
    total: rows.filter((r) => r.type === t).length,
    pending: rows.filter((r) => r.type === t && r.status === "pending").length,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Time Off</h1>
        <p className="text-sm text-slate-500">Pilih folder untuk melihat pengajuan sesuai jenisnya.</p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          Gagal memuat data dari database: {error.message}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {FOLDERS.map(({ type, desc }) => {
          const s = stat(type);
          return (
            <Link
              key={type}
              href={`/admin/leave/${type}`}
              className="card flex items-start gap-3 transition hover:shadow-md"
            >
              <FolderOpen className="mt-0.5 text-brand-600" size={28} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">Folder {LEAVE_TYPE_LABEL[type]}</p>
                <p className="text-xs text-slate-500">{desc}</p>
                <p className="mt-2 text-sm text-slate-600">{s.total} pengajuan</p>
                {s.pending > 0 && (
                  <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    {s.pending} menunggu
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

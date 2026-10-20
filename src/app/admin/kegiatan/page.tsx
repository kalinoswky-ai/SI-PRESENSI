import { createClient } from "@/lib/supabase/server";
import { getLeaveApprover } from "@/lib/admin/auth";
import type { Kegiatan } from "@/types";
import KegiatanManager from "./KegiatanManager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminKegiatanPage() {
  const supabase = createClient();
  const canManage = (await getLeaveApprover()) !== null;

  const [{ data: rows, error }, { data: peserta }, { data: emps }] = await Promise.all([
    supabase.from("kegiatan_absensi").select("*").order("activity_date", { ascending: false }).limit(200),
    supabase.from("kegiatan_peserta").select("kegiatan_id, employee_id").limit(10000),
    supabase
      .from("employees")
      .select("id, full_name, nip, role")
      .eq("is_active", true)
      .neq("role", "admin")
      .order("full_name"),
  ]);

  const countMap: Record<string, number> = {};
  (peserta ?? []).forEach((p) => {
    countMap[p.kegiatan_id as string] = (countMap[p.kegiatan_id as string] ?? 0) + 1;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Kegiatan Lapangan</h1>
        <p className="text-sm text-slate-500">
          Absen masuk di lokasi kegiatan (mis. kegiatan pagi hari yang tidak memungkinkan ke kantor). Terkunci:
          hanya peserta yang ditugaskan, pada tanggal &amp; jam yang ditetapkan, dan di dalam radius lokasi.
        </p>
        {!canManage && <p className="mt-1 text-sm text-slate-500">Mode lihat saja.</p>}
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          Gagal memuat kegiatan: {error.message}. Pastikan supabase/update-admin-approval-apel-kegiatan.sql sudah dijalankan.
        </p>
      )}
      <KegiatanManager
        canManage={canManage}
        kegiatan={(rows ?? []) as Kegiatan[]}
        participantCounts={countMap}
        employees={(emps ?? []) as { id: string; full_name: string; nip: string | null; role: string }[]}
      />
    </div>
  );
}

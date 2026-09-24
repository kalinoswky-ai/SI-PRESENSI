import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { UserPlus, ScanFace } from "lucide-react";

// Selalu render ulang & ambil data terbaru dari Supabase — jangan di-cache Next.js.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmployeesPage() {
  const supabase = createClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, nip, full_name, position, role, is_active, face_descriptor, face_enrollment_status")
    .order("full_name");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">Data Pegawai ({employees?.length ?? 0})</h1>
        <Link href="/admin/employees/new" className="btn-primary">
          <UserPlus size={18} />
          Tambah Pegawai
        </Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">NIP</th>
              <th className="px-4 py-3">Jabatan</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Wajah</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees?.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{e.full_name}</td>
                <td className="px-4 py-3 text-slate-600">{e.nip}</td>
                <td className="px-4 py-3 text-slate-600">{e.position ?? "-"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      e.role === "admin" ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {e.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {e.face_descriptor ? (
                    <ScanFace className="text-emerald-500" size={16} />
                  ) : e.face_enrollment_status === "pending" ? (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-600">
                      Menunggu
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600">Belum</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      e.is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                    }`}
                  >
                    {e.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/employees/${e.id}`} className="text-brand-600 hover:underline">
                    Kelola
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

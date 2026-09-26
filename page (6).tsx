import { createClient } from "@/lib/supabase/server";
import { getViewerProfile } from "@/lib/admin/auth";
import { PIMPINAN_TYPE_LABEL, ROLE_LABEL } from "@/types";
import Link from "next/link";
import { UserPlus, ScanFace, Pencil, FileSpreadsheet, Download } from "lucide-react";
import DeleteEmployeeButton from "./DeleteEmployeeButton";

// Selalu render ulang & ambil data terbaru dari Supabase — jangan di-cache Next.js.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmployeesPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const selfId = userData.user?.id;
  const viewer = await getViewerProfile();
  const isAdmin = viewer?.role === "admin";
  const { data: employees } = await supabase
    .from("employees")
    .select("id, nip, full_name, position, role, pimpinan_type, is_active, face_descriptor, face_enrollment_status")
    .order("full_name");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">Data Pegawai ({employees?.length ?? 0})</h1>
        <div className="flex flex-wrap justify-end gap-2">
          {/* Export hanya membaca data → boleh untuk Admin & Pimpinan. Bukan <Link> agar file diunduh, bukan dinavigasi. */}
          <a href="/api/employees/export" className="btn-secondary">
            <Download size={18} />
            Export Data Pegawai
          </a>
          {isAdmin && (
            <>
            <Link href="/admin/employees/import" className="btn-secondary">
              <FileSpreadsheet size={18} />
              Import Excel
            </Link>
            <Link href="/admin/employees/new" className="btn-primary">
              <UserPlus size={18} />
              Tambah Pegawai
            </Link>
            </>
          )}
        </div>
      </div>
      {!isAdmin && (
        <p className="text-sm text-slate-500">Mode lihat saja — hubungi Admin untuk menambah/mengubah data pegawai.</p>
      )}

      <div className="card max-h-[75vh] overflow-auto p-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-500 shadow-sm">
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
                      e.role === "admin"
                        ? "bg-brand-50 text-brand-700"
                        : e.role === "pimpinan"
                        ? "bg-violet-50 text-violet-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {ROLE_LABEL[e.role as keyof typeof ROLE_LABEL] ?? e.role}
                  </span>
                  {e.role === "pimpinan" && (
                    <span className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800">
                      {e.pimpinan_type
                        ? PIMPINAN_TYPE_LABEL[e.pimpinan_type as keyof typeof PIMPINAN_TYPE_LABEL]
                        : "Belum diatur"}
                    </span>
                  )}
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
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {isAdmin ? (
                    <>
                      <Link
                        href={`/admin/employees/${e.id}`}
                        className="mr-3 inline-flex items-center gap-1 text-brand-600 hover:underline"
                      >
                        <Pencil size={14} /> Edit
                      </Link>
                      {e.id !== selfId && <DeleteEmployeeButton id={e.id} name={e.full_name} compact />}
                    </>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

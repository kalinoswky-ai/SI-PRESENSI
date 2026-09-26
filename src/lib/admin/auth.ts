import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { EmployeeRole, LeaveType, PimpinanType } from "@/types";

/**
 * Jenis pengajuan yang (selain Inspektur & Sekretaris — lihat getLeaveApprover, yang berwenang
 * penuh utk SEMUA jenis) juga boleh disetujui Admin utama.
 * "pengecualian_apel" digabung ke kelompok ini (sama seperti izin/sakit) sesuai permintaan:
 * pengajuan boleh disetujui pimpinan (Inspektur ATAU Sekretaris) atau Admin utama.
 */
const SEKRETARIS_ADMIN_LEAVE_TYPES: LeaveType[] = ["izin", "sakit", "pengecualian_apel"];

/**
 * Memastikan pemanggil adalah Admin yang login & aktif. Dipakai semua API edit/hapus data.
 * Otorisasi dicek di SERVER (bukan hanya menyembunyikan tombol di tampilan).
 */
export async function requireAdmin(): Promise<{ id: string; name: string } | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data } = await supabase
    .from("employees")
    .select("role, is_active, full_name")
    .eq("id", userData.user.id)
    .single();

  if (!data || data.role !== "admin" || !data.is_active) return null;
  return { id: userData.user.id, name: data.full_name as string };
}

/**
 * Memastikan pemanggil adalah Admin ATAU Pimpinan (Inspektur/Sekretaris) yang login & aktif.
 * Dipakai untuk endpoint yang HANYA MEMBACA/MENGUNDUH data (mis. export laporan Excel) —
 * bukan untuk endpoint yang mengubah/menghapus data (tetap pakai requireAdmin di atas).
 */
export async function requireAdminOrPimpinan(): Promise<{ id: string; name: string; role: EmployeeRole } | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data } = await supabase
    .from("employees")
    .select("role, is_active, full_name")
    .eq("id", userData.user.id)
    .single();

  if (!data || !data.is_active || (data.role !== "admin" && data.role !== "pimpinan")) return null;
  return { id: userData.user.id, name: data.full_name as string, role: data.role as EmployeeRole };
}

/**
 * Ambil profil ringkas (role, nama, jabatan) pengguna yang sedang login, untuk kebutuhan
 * tampilan (mis. menyembunyikan tombol Tambah/Edit/Hapus di halaman Admin bila role
 * bukan 'admin'). Ini BUKAN pengaman keamanan — otorisasi sesungguhnya tetap di RLS
 * Supabase (is_admin() / is_admin_or_pimpinan()) dan requireAdmin() di setiap API tulis.
 */
export async function getViewerProfile(): Promise<{
  id: string;
  role: EmployeeRole;
  full_name: string;
  position: string | null;
  pimpinan_type: PimpinanType | null;
} | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data } = await supabase
    .from("employees")
    .select("role, full_name, position, pimpinan_type")
    .eq("id", userData.user.id)
    .single();
  if (!data) return null;

  return {
    id: userData.user.id,
    role: data.role as EmployeeRole,
    full_name: data.full_name as string,
    position: (data.position as string | null) ?? null,
    pimpinan_type: (data.pimpinan_type as PimpinanType | null) ?? null,
  };
}

/**
 * Penyetuju pengajuan cuti/izin/sakit/dinas/lembur — akun role 'pimpinan' yang aktif DAN:
 *   - bertanda can_approve_leave = true (Inspektur), ATAU
 *   - berjabatan Sekretaris (pimpinan_type = 'sekretaris', dgn fallback ke teks Jabatan lama
 *     bila pimpinan_type belum diisi).
 * Sekretaris diberi wewenang PENUH yang sama seperti Inspektur (termasuk Cuti, Dinas Dalam,
 * Dinas Luar, dan Lembur — yang sebelumnya khusus Inspektur) supaya tetap ada yang bisa
 * memproses pengajuan saat Inspektur berhalangan. Admin tidak termasuk di sini — Admin tetap
 * hanya berwenang untuk Izin/Sakit/Pengecualian Apel (lihat getLeaveTypeApprover di bawah).
 * Gagal-tertutup: bila query error (mis. migrasi belum dijalankan) hasilnya null = tidak berwenang.
 * Dipakai di API (penegakan sesungguhnya, berpasangan dengan RLS is_leave_approver()) dan tampilan.
 */
export async function getLeaveApprover(): Promise<{ id: string; name: string } | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from("employees")
    .select("role, is_active, full_name, can_approve_leave, position, pimpinan_type")
    .eq("id", userData.user.id)
    .single();

  if (error || !data) return null;
  if (data.role !== "pimpinan" || !data.is_active) return null;

  const isInspektur = data.can_approve_leave === true;
  const isSekretaris =
    data.pimpinan_type === "sekretaris" ||
    (!data.pimpinan_type && ((data.position as string | null) ?? "").toLowerCase().includes("sekretaris"));

  if (!isInspektur && !isSekretaris) return null;
  return { id: userData.user.id, name: data.full_name as string };
}

/**
 * Penyetuju pengajuan UNTUK JENIS TERTENTU (`type`):
 *  - Semua jenis (Cuti, Izin, Sakit, Dinas Dalam, Dinas Luar, Pengecualian Apel, Lembur):
 *    boleh Inspektur ATAU Sekretaris (getLeaveApprover) — masing-masing harus akun aktif.
 *  - Izin, Sakit, Pengecualian Apel: TAMBAHAN boleh juga Admin utama (role 'admin').
 * Dipakai di API PATCH /api/leave/[id] dan tampilan folder Time Off, berpasangan dengan
 * RLS is_izin_sakit_approver() (lihat supabase/update-approval-izin-sakit-sekretaris-admin.sql).
 * Gagal-tertutup: error / role tak dikenal -> null (tidak berwenang).
 */
export async function getLeaveTypeApprover(
  type: LeaveType
): Promise<{ id: string; name: string; role: EmployeeRole } | null> {
  // Inspektur ATAU Sekretaris selalu berwenang, untuk semua jenis pengajuan.
  const inspektur = await getLeaveApprover();
  if (inspektur) return { id: inspektur.id, name: inspektur.name, role: "pimpinan" };

  if (!SEKRETARIS_ADMIN_LEAVE_TYPES.includes(type)) return null;

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from("employees")
    .select("role, is_active, full_name, position, pimpinan_type")
    .eq("id", userData.user.id)
    .single();
  if (error || !data || !data.is_active) return null;

  const isAdminUtama = data.role === "admin";
  // pimpinan_type adalah sumber kebenaran (diisi lewat dropdown Jabatan Pimpinan di Kelola
  // Pegawai). Fallback ke teks Jabatan lama (untuk akun yang belum disimpan ulang lewat form
  // baru) supaya tidak tiba-tiba kehilangan akses.
  const isSekretaris =
    data.role === "pimpinan" &&
    (data.pimpinan_type === "sekretaris" ||
      (!data.pimpinan_type && ((data.position as string | null) ?? "").toLowerCase().includes("sekretaris")));

  if (!isAdminUtama && !isSekretaris) return null;
  return { id: userData.user.id, name: data.full_name as string, role: data.role as EmployeeRole };
}

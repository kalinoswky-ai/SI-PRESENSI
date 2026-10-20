import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { EmployeeRole, LeaveType, PimpinanType } from "@/types";

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
 * Penyetuju SEMUA pengajuan (cuti, izin, sakit, dinas dalam/luar daerah, pengecualian apel, lembur):
 *   - Admin utama (role 'admin', aktif) — wewenang PENUH, setara Inspektur & Sekretaris, ATAU
 *   - akun role 'pimpinan' aktif yang bertanda can_approve_leave = true (Inspektur), ATAU
 *   - akun role 'pimpinan' aktif berjabatan Sekretaris (pimpinan_type = 'sekretaris', dgn
 *     fallback ke teks Jabatan lama bila pimpinan_type belum diisi).
 * Gagal-tertutup: bila query error (mis. migrasi belum dijalankan) hasilnya null = tidak berwenang.
 * Dipakai di API (penegakan sesungguhnya, berpasangan dgn RLS is_leave_approver() yang sudah
 * ikut memasukkan Admin — lihat supabase/update-admin-approval-apel-kegiatan.sql) dan tampilan.
 */
export async function getLeaveApprover(): Promise<{ id: string; name: string; role: EmployeeRole } | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from("employees")
    .select("role, is_active, full_name, can_approve_leave, position, pimpinan_type")
    .eq("id", userData.user.id)
    .single();

  if (error || !data || !data.is_active) return null;

  // Admin utama: berwenang menyetujui semua jenis pengajuan.
  if (data.role === "admin") {
    return { id: userData.user.id, name: data.full_name as string, role: "admin" };
  }

  if (data.role !== "pimpinan") return null;

  const isInspektur = data.can_approve_leave === true;
  const isSekretaris =
    data.pimpinan_type === "sekretaris" ||
    (!data.pimpinan_type && ((data.position as string | null) ?? "").toLowerCase().includes("sekretaris"));

  if (!isInspektur && !isSekretaris) return null;
  return { id: userData.user.id, name: data.full_name as string, role: "pimpinan" };
}

/**
 * Penyetuju pengajuan UNTUK JENIS TERTENTU (`type`). Sejak Admin utama diberi wewenang penuh,
 * SEMUA jenis (Cuti, Izin, Sakit, Dinas Dalam, Dinas Luar, Pengecualian Apel) bisa disetujui/
 * ditolak oleh Inspektur, Sekretaris, ATAU Admin utama (masing-masing akun aktif).
 * Parameter `type` dipertahankan agar pemanggil lama tidak perlu diubah dan agar mudah
 * dibatasi lagi per jenis bila kebijakan berubah.
 * Dipakai di API PATCH /api/leave/[id] dan tampilan folder Time Off, berpasangan dengan
 * RLS is_leave_approver() / is_izin_sakit_approver().
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getLeaveTypeApprover(
  _type: LeaveType
): Promise<{ id: string; name: string; role: EmployeeRole } | null> {
  return getLeaveApprover();
}

/**
 * Penyetuju KOREKSI ABSENSI (Tahap 3). Mengikuti kelompok yang sama dengan Izin/Sakit/Pengecualian
 * Apel: Inspektur, Sekretaris, ATAU Admin utama. Diletakkan di satu fungsi agar mudah diubah bila
 * kebijakan berubah (mis. hanya Admin) tanpa menyentuh sistem persetujuan cuti/izin yang berjalan.
 */
export async function getCorrectionApprover(): Promise<{ id: string; name: string; role: EmployeeRole } | null> {
  return getLeaveTypeApprover("izin");
}

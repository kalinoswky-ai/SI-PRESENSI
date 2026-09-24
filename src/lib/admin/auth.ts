import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { EmployeeRole } from "@/types";

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
} | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data } = await supabase
    .from("employees")
    .select("role, full_name, position")
    .eq("id", userData.user.id)
    .single();
  if (!data) return null;

  return {
    id: userData.user.id,
    role: data.role as EmployeeRole,
    full_name: data.full_name as string,
    position: (data.position as string | null) ?? null,
  };
}

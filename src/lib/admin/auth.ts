import "server-only";
import { createClient } from "@/lib/supabase/server";

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

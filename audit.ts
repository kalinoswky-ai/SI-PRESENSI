import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuditEntry {
  action: string;
  target_type: "attendance" | "employee";
  target_id?: string | null;
  target_label?: string | null;
  reason?: string | null;
  old_data?: unknown;
  new_data?: unknown;
}

/**
 * Catat jejak audit. Mengembalikan pesan error (string) bila gagal, null bila sukses.
 * Pemanggil HARUS membatalkan operasi bila hasilnya bukan null — perubahan data tanpa jejak
 * audit tidak diperbolehkan.
 */
export async function writeAudit(
  admin: SupabaseClient,
  actor: { id: string; name: string },
  entry: AuditEntry
): Promise<string | null> {
  const { error } = await admin.from("audit_log").insert({
    actor_id: actor.id,
    actor_name: actor.name,
    action: entry.action,
    target_type: entry.target_type,
    target_id: entry.target_id ?? null,
    target_label: entry.target_label ?? null,
    reason: entry.reason ?? null,
    old_data: entry.old_data ?? null,
    new_data: entry.new_data ?? null,
  });
  if (error) {
    return `Gagal mencatat riwayat perubahan (${error.message}). Pastikan file supabase/update-kelola-data-audit.sql sudah dijalankan di Supabase SQL Editor.`;
  }
  return null;
}

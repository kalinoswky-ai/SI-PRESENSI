import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";

const EDITABLE = ["full_name", "position", "role", "is_active", "nip", "phone", "apel_group"] as const;

// Edit data pegawai (khusus Admin). Perubahan dicatat di audit_log.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await requireAdmin();
  if (!actor) {
    return NextResponse.json({ error: "Hanya Admin yang dapat mengubah data pegawai." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (key in body) updates[key] = body[key];
  }
  if ("full_name" in updates && !String(updates.full_name ?? "").trim()) {
    return NextResponse.json({ error: "Nama lengkap tidak boleh kosong." }, { status: 400 });
  }
  if ("role" in updates && !["admin", "employee", "pimpinan"].includes(updates.role as string)) {
    return NextResponse.json({ error: "Role tidak valid." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: old } = await admin
    .from("employees")
    .select("id, nip, full_name, position, role, is_active, phone, apel_group")
    .eq("id", params.id)
    .single();
  if (!old) {
    return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });
  }

  const oldChanged: Record<string, unknown> = {};
  const newChanged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    const before = (old as Record<string, unknown>)[key] ?? null;
    if (before !== (value ?? null)) {
      oldChanged[key] = before;
      newChanged[key] = value ?? null;
    }
  }
  if (Object.keys(newChanged).length === 0) {
    return NextResponse.json({ success: true, unchanged: true });
  }

  // Pengaman: jangan sampai sistem kehilangan seluruh Admin aktif (terkunci dari sistem).
  const removesAdmin =
    old.role === "admin" &&
    old.is_active &&
    (newChanged.role === "employee" || newChanged.is_active === false);
  if (removesAdmin) {
    const { count } = await admin
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true)
      .neq("id", params.id);
    if (!count) {
      return NextResponse.json(
        { error: "Tidak dapat menurunkan/menonaktifkan satu-satunya Admin aktif." },
        { status: 400 }
      );
    }
  }

  const auditError = await writeAudit(admin, actor, {
    action: "employee.update",
    target_type: "employee",
    target_id: params.id,
    target_label: `${old.full_name} (NIP ${old.nip ?? "-"})`,
    old_data: oldChanged,
    new_data: newChanged,
  });
  if (auditError) return NextResponse.json({ error: auditError }, { status: 500 });

  const { error } = await admin
    .from("employees")
    .update({ ...newChanged, updated_at: new Date().toISOString() })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}

/**
 * Hapus pegawai PERMANEN (khusus Admin): akun login, profil, seluruh data absensi & pengajuan
 * cuti/izin miliknya (cascade), serta file foto/selfie/lampirannya di Storage.
 * Untuk pegawai yang sudah tidak bertugas, menonaktifkan akun lebih aman (data historis tetap).
 */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await requireAdmin();
  if (!actor) {
    return NextResponse.json({ error: "Hanya Admin yang dapat menghapus pegawai." }, { status: 403 });
  }
  if (actor.id === params.id) {
    return NextResponse.json({ error: "Anda tidak dapat menghapus akun Anda sendiri." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("employees")
    .select("id, nip, full_name, position, email, phone, role, is_active, apel_group, created_at")
    .eq("id", params.id)
    .single();
  if (!emp) {
    return NextResponse.json({ error: "Pegawai tidak ditemukan (mungkin sudah dihapus)." }, { status: 404 });
  }

  if (emp.role === "admin" && emp.is_active) {
    const { count } = await admin
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true)
      .neq("id", params.id);
    if (!count) {
      return NextResponse.json({ error: "Tidak dapat menghapus satu-satunya Admin aktif." }, { status: 400 });
    }
  }

  const [{ count: attendanceCount }, { count: leaveCount }] = await Promise.all([
    admin.from("attendance").select("id", { count: "exact", head: true }).eq("employee_id", params.id),
    admin.from("leave_requests").select("id", { count: "exact", head: true }).eq("employee_id", params.id),
  ]);

  const target = {
    action: "employee.delete",
    target_type: "employee" as const,
    target_id: params.id,
    target_label: `${emp.full_name} (NIP ${emp.nip ?? "-"})`,
    old_data: { ...emp, jumlah_data_absensi_terhapus: attendanceCount ?? 0, jumlah_pengajuan_terhapus: leaveCount ?? 0 },
  };
  const auditError = await writeAudit(admin, actor, target);
  if (auditError) return NextResponse.json({ error: auditError }, { status: 500 });

  // Pegawai yang pernah memproses pengajuan cuti (admin) tidak boleh menahan penghapusan
  await admin.from("leave_requests").update({ reviewed_by: null }).eq("reviewed_by", params.id);

  // Bersihkan file di Storage (best-effort) — semua bucket memakai folder = id pegawai
  for (const bucket of ["selfies", "profile-photos", "leave-attachments"]) {
    try {
      const { data: files } = await admin.storage.from(bucket).list(params.id, { limit: 1000 });
      if (files && files.length > 0) {
        await admin.storage.from(bucket).remove(files.map((f) => `${params.id}/${f.name}`));
      }
    } catch {
      // diabaikan
    }
  }

  const { error: authError } = await admin.auth.admin.deleteUser(params.id);
  if (authError && authError.status !== 404 && !/not found/i.test(authError.message)) {
    await writeAudit(admin, actor, {
      ...target,
      action: "employee.delete_failed",
      reason: authError.message,
      old_data: null,
    });
    return NextResponse.json({ error: `Gagal menghapus akun: ${authError.message}` }, { status: 500 });
  }

  // Bila akun auth sudah tidak ada / tidak cascade, pastikan baris profil ikut terhapus
  const { error: rowError } = await admin.from("employees").delete().eq("id", params.id);
  if (rowError) {
    return NextResponse.json({ error: rowError.message }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    deletedAttendance: attendanceCount ?? 0,
    deletedLeave: leaveCount ?? 0,
  });
}

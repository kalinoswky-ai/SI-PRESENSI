import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";

const MIN_LENGTH = 8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Password sementara acak (tanpa karakter yang mudah tertukar: 0/O, 1/l/I). */
function generateTempPassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[randomInt(chars.length)];
  return out;
}

/**
 * Reset password pegawai yang lupa password (khusus Admin utama).
 * Password lama TIDAK bisa dilihat (Supabase hanya menyimpan hash) — Admin memberikan password
 * BARU: diketik sendiri, atau dibuatkan acak oleh sistem. Pegawai wajib menggantinya saat login
 * berikutnya. Password baru tidak ditulis ke audit log; yang tercatat hanya siapa & kapan.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await requireAdmin();
  if (!actor) {
    return NextResponse.json({ error: "Hanya Admin yang dapat mereset password pegawai." }, { status: 403 });
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "ID pegawai tidak valid." }, { status: 400 });
  }
  if (params.id === actor.id) {
    return NextResponse.json(
      { error: "Untuk mengubah password Anda sendiri gunakan Pengaturan → Security." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const typed = typeof body?.newPassword === "string" ? body.newPassword : "";
  const generated = typed.length === 0;
  const newPassword = generated ? generateTempPassword() : typed;
  if (!generated && newPassword.length < MIN_LENGTH) {
    return NextResponse.json({ error: `Password baru minimal ${MIN_LENGTH} karakter.` }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("employees")
    .select("id, full_name, role")
    .eq("id", params.id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });
  }
  if (target.role === "admin") {
    return NextResponse.json({ error: "Password akun Admin lain tidak dapat direset dari sini." }, { status: 403 });
  }

  // Catat audit DULU (tanpa password) — tanpa jejak audit, reset tidak dijalankan.
  const auditError = await writeAudit(admin, actor, {
    action: "employee.reset_password",
    target_type: "employee",
    target_id: target.id,
    target_label: target.full_name,
    reason: generated ? "Reset password (dibuat otomatis oleh sistem)" : "Reset password (diketik Admin)",
  });
  if (auditError) return NextResponse.json({ error: auditError }, { status: 500 });

  const { error: updateError } = await admin.auth.admin.updateUserById(target.id, { password: newPassword });
  if (updateError) {
    return NextResponse.json({ error: "Gagal mengubah password: " + updateError.message }, { status: 400 });
  }

  // Wajibkan pegawai mengganti password sementara saat login berikutnya.
  const { error: flagError } = await admin
    .from("employees")
    .update({ must_change_password: true })
    .eq("id", target.id);

  return NextResponse.json({
    success: true,
    // Password hanya dikembalikan bila dibuat sistem (agar Admin bisa menyampaikannya) — sekali tampil.
    temporaryPassword: generated ? newPassword : null,
    mustChangeFlagSet: !flagError,
  });
}

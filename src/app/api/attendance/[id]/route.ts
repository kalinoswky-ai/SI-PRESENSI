import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { formatWita } from "@/lib/geo";

const TYPES = ["in", "out"];
const STATUSES = ["valid", "rejected"];
const MODES = ["wfo", "wfh"];

function cleanText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Koreksi data absensi (khusus Admin). Alasan wajib & setiap perubahan dicatat di audit_log.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await requireAdmin();
  if (!actor) {
    return NextResponse.json({ error: "Hanya Admin yang dapat mengedit data absensi." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Data tidak valid." }, { status: 400 });
  }
  const reason = cleanText(body.reason);
  if (!reason || reason.length < 3) {
    return NextResponse.json({ error: "Alasan koreksi wajib diisi (minimal 3 karakter)." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: old, error: oldError } = await admin
    .from("attendance")
    .select("*, employees(full_name, nip)")
    .eq("id", params.id)
    .single();
  if (oldError || !old) {
    return NextResponse.json({ error: "Data absensi tidak ditemukan." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if ("type" in body) {
    if (!TYPES.includes(body.type)) return NextResponse.json({ error: "Jenis absen tidak valid." }, { status: 400 });
    updates.type = body.type;
  }
  if ("server_time" in body) {
    const d = new Date(body.server_time);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Waktu tidak valid." }, { status: 400 });
    updates.server_time = d.toISOString();
  }
  if ("status" in body) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "Status tidak valid." }, { status: 400 });
    updates.status = body.status;
  }
  if ("work_mode" in body) {
    if (!MODES.includes(body.work_mode)) return NextResponse.json({ error: "Mode kerja tidak valid." }, { status: 400 });
    updates.work_mode = body.work_mode;
  }
  if ("is_late" in body) updates.is_late = Boolean(body.is_late);
  if ("location_label" in body) updates.location_label = cleanText(body.location_label);
  if ("reject_reason" in body) updates.reject_reason = cleanText(body.reject_reason);
  // Status dikoreksi menjadi Valid -> alasan penolakan lama tidak relevan lagi
  if (updates.status === "valid" && !("reject_reason" in body)) updates.reject_reason = null;

  // Hitung perubahan sebenarnya (utk audit) — abaikan field yang nilainya sama
  const oldChanged: Record<string, unknown> = {};
  const newChanged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    const before = (old as Record<string, unknown>)[key];
    const same =
      key === "server_time"
        ? new Date(before as string).getTime() === new Date(value as string).getTime()
        : (before ?? null) === (value ?? null);
    if (!same) {
      oldChanged[key] = before ?? null;
      newChanged[key] = value ?? null;
    }
  }
  if (Object.keys(newChanged).length === 0) {
    return NextResponse.json({ error: "Tidak ada perubahan data." }, { status: 400 });
  }

  const emp = (old as { employees?: { full_name?: string; nip?: string } }).employees;
  const auditError = await writeAudit(admin, actor, {
    action: "attendance.update",
    target_type: "attendance",
    target_id: params.id,
    target_label: `${emp?.full_name ?? "-"} — absen ${old.type === "in" ? "masuk" : "pulang"} ${formatWita(
      new Date(old.server_time)
    )}`,
    reason,
    old_data: oldChanged,
    new_data: newChanged,
  });
  if (auditError) return NextResponse.json({ error: auditError }, { status: 500 });

  const { error } = await admin
    .from("attendance")
    .update({ ...newChanged, edited_at: new Date().toISOString(), edited_by: actor.id, edit_note: reason })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}

// Hapus satu data absensi (khusus Admin). Alasan wajib; snapshot data disimpan di audit_log.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await requireAdmin();
  if (!actor) {
    return NextResponse.json({ error: "Hanya Admin yang dapat menghapus data absensi." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const reason = cleanText(body?.reason);
  if (!reason || reason.length < 3) {
    return NextResponse.json({ error: "Alasan penghapusan wajib diisi (minimal 3 karakter)." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: old, error: oldError } = await admin
    .from("attendance")
    .select("*, employees(full_name, nip)")
    .eq("id", params.id)
    .single();
  if (oldError || !old) {
    return NextResponse.json({ error: "Data absensi tidak ditemukan (mungkin sudah dihapus)." }, { status: 404 });
  }

  const emp = (old as { employees?: { full_name?: string } }).employees;
  const { employees: _omit, ...snapshot } = old as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-unused-vars
  const auditError = await writeAudit(admin, actor, {
    action: "attendance.delete",
    target_type: "attendance",
    target_id: params.id,
    target_label: `${emp?.full_name ?? "-"} — absen ${old.type === "in" ? "masuk" : "pulang"} ${formatWita(
      new Date(old.server_time)
    )}`,
    reason,
    old_data: snapshot,
  });
  if (auditError) return NextResponse.json({ error: auditError }, { status: 500 });

  const { error } = await admin.from("attendance").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (old.selfie_url) {
    try {
      await admin.storage.from("selfies").remove([old.selfie_url]);
    } catch {
      // pembersihan file bersifat best-effort
    }
  }

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { witaDateKey } from "@/lib/geo";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Jenis yang membebaskan pegawai dari absensi. Pengecualian apel tidak membebaskan, jadi tidak relevan.
const RESUMABLE = ["cuti", "izin", "sakit", "dinas_dalam", "dinas_luar"];

function dayBefore(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day - 1)).toISOString().slice(0, 10);
}

/**
 * OTORISASI "MASUK LEBIH AWAL" — hanya ADMIN UTAMA.
 * Pegawai dengan pengajuan cuti/izin/sakit/dinas yang sudah disetujui ternyata masuk lebih cepat dari
 * jadwal: Admin menetapkan tanggal masuk kembali (hari ini atau nanti, dalam rentang pengajuan).
 * Masa pengajuan dipangkas sehingga mulai tanggal tsb pegawai dapat & wajib absen. Semua syarat
 * diperiksa di server; perubahan dicatat di Riwayat Perubahan (audit) — gagal audit = dibatalkan.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Hanya Admin utama yang berwenang mengatur masuk lebih awal." }, { status: 403 });
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "ID pengajuan tidak valid." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const resumeDate = body?.resume_date;
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (typeof resumeDate !== "string" || !DATE_RE.test(resumeDate)) {
    return NextResponse.json({ error: "Tanggal masuk kembali tidak valid." }, { status: 400 });
  }
  if (note.length < 3 || note.length > 300) {
    return NextResponse.json({ error: "Alasan wajib diisi (3–300 karakter)." }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: leave, error: readError } = await db.from("leave_requests").select("*").eq("id", params.id).maybeSingle();
  if (readError || !leave) {
    return NextResponse.json({ error: "Pengajuan tidak ditemukan." }, { status: 404 });
  }
  if (leave.status !== "approved" || !RESUMABLE.includes(leave.type)) {
    return NextResponse.json({ error: "Hanya pengajuan yang sudah disetujui yang dapat dimajukan." }, { status: 409 });
  }

  const todayKey = witaDateKey(new Date());
  if (resumeDate < todayKey) {
    return NextResponse.json({ error: "Tanggal masuk kembali tidak boleh sebelum hari ini. Untuk tanggal lampau gunakan Koreksi Absensi." }, { status: 400 });
  }
  if (resumeDate < leave.start_date || resumeDate > leave.end_date) {
    return NextResponse.json(
      { error: `Tanggal masuk kembali harus di dalam masa pengajuan (${leave.start_date} s/d ${leave.end_date}).` },
      { status: 400 }
    );
  }

  const cancelAll = resumeDate === leave.start_date;
  const patch = cancelAll
    ? { status: "cancelled" }
    : { end_date: dayBefore(resumeDate) };
  const { data: updated, error: updError } = await db
    .from("leave_requests")
    .update({
      ...patch,
      original_end_date: leave.original_end_date ?? leave.end_date,
      resumed_by: admin.id,
      resumed_at: new Date().toISOString(),
      resume_note: note,
    })
    .eq("id", params.id)
    .eq("status", "approved")
    .eq("end_date", leave.end_date) // cegah tabrakan bila diubah bersamaan
    .select("id");

  if (updError) {
    const notReady = /original_end_date|resume|cancelled|schema cache|check constraint/i.test(updError.message ?? "");
    return NextResponse.json(
      {
        error: notReady
          ? "Jalankan supabase/update-masuk-lebih-awal.sql di Supabase SQL Editor terlebih dahulu."
          : "Gagal menyimpan perubahan.",
      },
      { status: 500 }
    );
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "Pengajuan sudah berubah. Muat ulang halaman." }, { status: 409 });
  }

  const { data: emp } = await db.from("employees").select("full_name, nip").eq("id", leave.employee_id).maybeSingle();
  const auditError = await writeAudit(db, admin, {
    action: "leave.resume_early",
    target_type: "leave",
    target_id: params.id,
    target_label: `${emp?.full_name ?? "Pegawai"}${emp?.nip ? ` (${emp.nip})` : ""} — ${leave.type}`,
    reason: note,
    old_data: { status: leave.status, start_date: leave.start_date, end_date: leave.end_date },
    new_data: { resume_date: resumeDate, ...(cancelAll ? { status: "cancelled" } : { end_date: patch.end_date }) },
  });
  if (auditError) {
    // Jejak audit wajib ada — kembalikan perubahan.
    await db
      .from("leave_requests")
      .update({
        status: leave.status,
        end_date: leave.end_date,
        original_end_date: leave.original_end_date ?? null,
        resumed_by: leave.resumed_by ?? null,
        resumed_at: leave.resumed_at ?? null,
        resume_note: leave.resume_note ?? null,
      })
      .eq("id", params.id);
    return NextResponse.json({ error: auditError }, { status: 500 });
  }

  return NextResponse.json({ success: true, cancelled: cancelAll, resume_date: resumeDate });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCorrectionApprover } from "@/lib/admin/auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Menyetujui / menolak koreksi absensi. Kewenangan DIPERIKSA DI SINI (server) — menyembunyikan
 * tombol di tampilan bukan pengaman. Perubahan status + data absensi + audit dijalankan dalam
 * satu transaksi oleh fungsi database (lihat supabase/update-persetujuan-koreksi.sql).
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const approver = await getCorrectionApprover();
  if (!approver) {
    return NextResponse.json(
      { error: "Hanya Inspektur, Sekretaris, atau Admin yang berwenang memproses koreksi absensi." },
      { status: 403 }
    );
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "ID pengajuan tidak valid." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const status = body?.status;
  const note = typeof body?.review_note === "string" ? body.review_note.trim() : "";
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "Status tidak valid." }, { status: 400 });
  }
  if (note.length > 500) {
    return NextResponse.json({ error: "Alasan keputusan terlalu panjang (maksimal 500 karakter)." }, { status: 400 });
  }
  if (status === "rejected" && note.length < 3) {
    return NextResponse.json({ error: "Alasan penolakan wajib diisi (minimal 3 karakter)." }, { status: 400 });
  }

  const admin = createAdminClient();
  const args = { p_id: params.id, p_actor: approver.id, p_actor_name: approver.name, p_note: note || null };
  const { data, error } =
    status === "approved"
      ? await admin.rpc("approve_attendance_correction", args)
      : await admin.rpc("reject_attendance_correction", args);

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("KOREKSI_SUDAH_DIPROSES")) {
      return NextResponse.json({ error: "Pengajuan sudah diproses. Muat ulang halaman." }, { status: 409 });
    }
    if (msg.includes("KOREKSI_TIDAK_DITEMUKAN")) {
      return NextResponse.json({ error: "Pengajuan tidak ditemukan." }, { status: 404 });
    }
    if (msg.includes("URUTAN_TIDAK_VALID")) {
      return NextResponse.json(
        { error: "Tidak dapat disetujui: jam yang diajukan bertentangan dengan absen masuk/pulang yang sudah tercatat. Tolak pengajuan ini atau minta pegawai mengajukan ulang." },
        { status: 409 }
      );
    }
    if (/could not find the function|schema cache|does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: "Fitur belum aktif: jalankan supabase/update-persetujuan-koreksi.sql di Supabase SQL Editor." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Gagal memproses pengajuan." }, { status: 500 });
  }

  return NextResponse.json({ success: true, result: data ?? null });
}

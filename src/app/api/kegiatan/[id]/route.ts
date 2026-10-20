import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeaveApprover } from "@/lib/admin/auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard(id: string) {
  const actor = await getLeaveApprover();
  if (!actor) {
    return { error: NextResponse.json({ error: "Tidak berwenang mengelola kegiatan." }, { status: 403 }) };
  }
  if (!UUID_RE.test(id)) {
    return { error: NextResponse.json({ error: "ID kegiatan tidak valid." }, { status: 400 }) };
  }
  return { actor };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Ubah kegiatan: aktif/nonaktif (nonaktif = absen kegiatan langsung ditolak) dan/atau opsi
 * absen PULANG dari lokasi tugas (allow_clock_out + clock_out_time "HH:MM" WITA).
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id);
  if (g.error) return g.error;
  const body = await request.json().catch(() => null);

  const update: Record<string, unknown> = {};
  if (body && "is_active" in body) {
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "Nilai is_active tidak valid." }, { status: 400 });
    }
    update.is_active = body.is_active;
  }
  if (body && "allow_clock_out" in body) {
    if (typeof body.allow_clock_out !== "boolean") {
      return NextResponse.json({ error: "Nilai allow_clock_out tidak valid." }, { status: 400 });
    }
    update.allow_clock_out = body.allow_clock_out;
    if (body.allow_clock_out) {
      if (typeof body.clock_out_time !== "string" || !TIME_RE.test(body.clock_out_time)) {
        return NextResponse.json({ error: "Jam mulai absen pulang tidak valid (format HH:MM)." }, { status: 400 });
      }
      update.clock_out_time = body.clock_out_time;
    }
  } else if (body && "clock_out_time" in body) {
    if (typeof body.clock_out_time !== "string" || !TIME_RE.test(body.clock_out_time)) {
      return NextResponse.json({ error: "Jam mulai absen pulang tidak valid (format HH:MM)." }, { status: 400 });
    }
    update.clock_out_time = body.clock_out_time;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Tidak ada perubahan yang dikirim." }, { status: 400 });
  }

  const { error } = await createAdminClient().from("kegiatan_absensi").update(update).eq("id", params.id);
  if (error) {
    const notReady = /allow_clock_out|clock_out_time|schema cache/i.test(error.message ?? "");
    return NextResponse.json(
      {
        error: notReady
          ? "Jalankan supabase/update-kegiatan-pulang-lokasi-tugas.sql di Supabase SQL Editor terlebih dahulu."
          : "Gagal memperbarui kegiatan.",
      },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true });
}

/** Hapus kegiatan (peserta ikut terhapus; riwayat absensi tetap, activity_id menjadi kosong). */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id);
  if (g.error) return g.error;
  const { error } = await createAdminClient().from("kegiatan_absensi").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: "Gagal menghapus kegiatan." }, { status: 500 });
  return NextResponse.json({ success: true });
}

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

/** Aktifkan / nonaktifkan kegiatan (nonaktif = absen kegiatan langsung ditolak). */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id);
  if (g.error) return g.error;
  const body = await request.json().catch(() => null);
  if (typeof body?.is_active !== "boolean") {
    return NextResponse.json({ error: "Nilai is_active tidak valid." }, { status: 400 });
  }
  const { error } = await createAdminClient()
    .from("kegiatan_absensi")
    .update({ is_active: body.is_active })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: "Gagal memperbarui kegiatan." }, { status: 500 });
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

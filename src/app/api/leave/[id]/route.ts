import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLeaveTypeApprover } from "@/lib/admin/auth";
import type { LeaveType } from "@/types";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  // Ambil dulu jenis pengajuan (izin/sakit boleh Sekretaris & Admin utama; cuti/dinas tetap
  // hanya Inspektur) — wewenang diperiksa PER JENIS, bukan generik.
  const { data: existing, error: existingError } = await supabase
    .from("leave_requests")
    .select("type")
    .eq("id", params.id)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: "Pengajuan tidak ditemukan." }, { status: 404 });
  }
  const leaveType = existing.type as LeaveType;

  const approver = await getLeaveTypeApprover(leaveType);
  if (!approver) {
    const message =
      leaveType === "izin" || leaveType === "sakit"
        ? "Hanya Inspektur, Sekretaris, atau Admin yang berwenang menyetujui/menolak pengajuan izin dan sakit."
        : "Hanya Inspektur yang berwenang menyetujui/menolak pengajuan cuti dan perjalanan dinas.";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  const body = await request.json();
  const status = body.status as string; // 'approved' | 'rejected'
  const reviewNote = (body.review_note as string) || null;

  if (!["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Status tidak valid." }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from("leave_requests")
    .update({
      status,
      review_note: reviewNote,
      reviewed_by: userData.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .eq("status", "pending")
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // Update yang tidak mengenai baris apa pun (sudah diproses admin lain / diblokir RLS)
  // jangan dilaporkan "berhasil".
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "Pengajuan tidak ditemukan atau sudah diproses. Muat ulang halaman." },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true });
}

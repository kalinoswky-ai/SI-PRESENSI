import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLeaveApprover } from "@/lib/admin/auth";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  // Penyetuju lembur = penyetuju yang sama dengan cuti/dinas (Inspektur ATAU Sekretaris). Admin hanya melihat.
  const approver = await getLeaveApprover();
  if (!approver) {
    return NextResponse.json(
      { error: "Hanya Inspektur atau Sekretaris yang berwenang menyetujui/menolak pengajuan lembur." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const status = body.status as string; // 'approved' | 'rejected'
  const reviewNote = (body.review_note as string) || null;

  if (!["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Status tidak valid." }, { status: 400 });
  }

  // Penyetuju tidak boleh menyetujui lemburnya sendiri.
  const { data: target } = await supabase
    .from("overtime_requests")
    .select("employee_id")
    .eq("id", params.id)
    .maybeSingle();
  if (target && target.employee_id === userData.user.id) {
    return NextResponse.json(
      { error: "Anda tidak dapat menyetujui/menolak pengajuan lembur Anda sendiri." },
      { status: 403 }
    );
  }

  const { data: updated, error } = await supabase
    .from("overtime_requests")
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
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "Pengajuan tidak ditemukan atau sudah diproses. Muat ulang halaman." },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true });
}

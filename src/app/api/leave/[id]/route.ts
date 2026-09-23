import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from("employees")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (requester?.role !== "admin") {
    return NextResponse.json(
      { error: "Hanya Admin yang dapat menyetujui/menolak pengajuan." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const status = body.status as string; // 'approved' | 'rejected'
  const reviewNote = (body.review_note as string) || null;

  if (!["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Status tidak valid." }, { status: 400 });
  }

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status,
      review_note: reviewNote,
      reviewed_by: userData.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

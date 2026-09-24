import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyNewLeaveRequest } from "@/lib/notifications/notify";
import type { LeaveType, Office } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }
  const userId = userData.user.id;

  const formData = await request.formData();
  const type = formData.get("type") as string; // 'cuti' | 'izin' | 'sakit'
  const startDate = formData.get("start_date") as string;
  const endDate = formData.get("end_date") as string;
  const reason = (formData.get("reason") as string)?.trim();
  const attachment = formData.get("attachment") as File | null;

  if (!["cuti", "izin", "sakit"].includes(type) || !startDate || !endDate || !reason) {
    return NextResponse.json({ error: "Data pengajuan tidak lengkap." }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json(
      { error: "Tanggal selesai tidak boleh sebelum tanggal mulai." },
      { status: 400 }
    );
  }

  let attachmentUrl: string | null = null;
  if (attachment && attachment.size > 0) {
    const ext = attachment.name.split(".").pop() || "pdf";
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("leave-attachments")
      .upload(path, await attachment.arrayBuffer(), {
        contentType: attachment.type || "application/octet-stream",
      });
    if (!uploadError) {
      attachmentUrl = path;
    }
  }

  const { data: record, error } = await supabase
    .from("leave_requests")
    .insert({
      employee_id: userId,
      type,
      start_date: startDate,
      end_date: endDate,
      reason,
      attachment_url: attachmentUrl,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Beritahu admin (WhatsApp/Telegram) bahwa ada pengajuan baru — best-effort.
  try {
    const [{ data: employee }, { data: office }] = await Promise.all([
      supabase.from("employees").select("full_name, nip, position").eq("id", userId).single(),
      supabase.from("offices").select("*").limit(1).single(),
    ]);
    if (employee && office) {
      await notifyNewLeaveRequest(employee, office as Office, {
        type: type as LeaveType,
        start_date: startDate,
        end_date: endDate,
        reason,
      });
    }
  } catch {
    // diabaikan: notifikasi tidak boleh menggagalkan pengajuan
  }

  return NextResponse.json({
    success: true,
    record,
    attachmentFailed: Boolean(attachment && attachment.size > 0 && !attachmentUrl),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyNewOvertimeRequest } from "@/lib/notifications/notify";
import { witaDateKey } from "@/lib/geo";
import type { Office } from "@/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_BACKDATE_DAYS = 30; // pengajuan lembur boleh mundur maksimal 30 hari
const MAX_DURATION_MINUTES = 12 * 60; // batas kewajaran per pengajuan

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }
  const userId = userData.user.id;

  const formData = await request.formData();
  const workDate = (formData.get("work_date") as string) ?? "";
  const startTime = (formData.get("start_time") as string) ?? "";
  const endTime = (formData.get("end_time") as string) ?? "";
  const description = ((formData.get("description") as string) ?? "").trim();
  const attachment = formData.get("attachment") as File | null;

  if (!DATE_RE.test(workDate) || !TIME_RE.test(startTime) || !TIME_RE.test(endTime) || !description) {
    return NextResponse.json({ error: "Data pengajuan lembur tidak lengkap." }, { status: 400 });
  }

  const duration = toMinutes(endTime) - toMinutes(startTime);
  if (duration <= 0) {
    return NextResponse.json({ error: "Jam selesai harus setelah jam mulai." }, { status: 400 });
  }
  if (duration > MAX_DURATION_MINUTES) {
    return NextResponse.json(
      { error: `Durasi lembur maksimal ${MAX_DURATION_MINUTES / 60} jam per pengajuan.` },
      { status: 400 }
    );
  }

  const earliest = witaDateKey(new Date(Date.now() - MAX_BACKDATE_DAYS * 24 * 60 * 60 * 1000));
  if (workDate < earliest) {
    return NextResponse.json(
      { error: `Tanggal lembur tidak boleh lebih dari ${MAX_BACKDATE_DAYS} hari yang lalu.` },
      { status: 400 }
    );
  }
  // Lembur boleh diajukan untuk hari ini maupun tanggal mendatang (rencana lembur).

  // Cegah pengajuan ganda: jam lembur tumpang-tindih dengan pengajuan lain (menunggu/disetujui) di tanggal yang sama.
  const { data: sameDay } = await supabase
    .from("overtime_requests")
    .select("start_time, end_time, status")
    .eq("employee_id", userId)
    .eq("work_date", workDate)
    .in("status", ["pending", "approved"]);
  const overlap = (sameDay ?? []).some(
    (r) =>
      toMinutes((r.start_time as string).slice(0, 5)) < toMinutes(endTime) &&
      toMinutes((r.end_time as string).slice(0, 5)) > toMinutes(startTime)
  );
  if (overlap) {
    return NextResponse.json(
      { error: "Sudah ada pengajuan lembur pada tanggal & jam yang bertumpang-tindih." },
      { status: 409 }
    );
  }

  let attachmentUrl: string | null = null;
  if (attachment && attachment.size > 0) {
    const ext = attachment.name.split(".").pop() || "pdf";
    // Bucket & kebijakan RLS sama dengan lampiran cuti (folder pertama = id pegawai).
    const path = `${userId}/lembur-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("leave-attachments")
      .upload(path, await attachment.arrayBuffer(), {
        contentType: attachment.type || "application/octet-stream",
      });
    if (!uploadError) attachmentUrl = path;
  }

  const { data: record, error } = await supabase
    .from("overtime_requests")
    .insert({
      employee_id: userId,
      work_date: workDate,
      start_time: startTime,
      end_time: endTime,
      description,
      attachment_url: attachmentUrl,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Beritahu admin/pengawas (WhatsApp/Telegram) — best-effort.
  try {
    const [{ data: employee }, { data: office }] = await Promise.all([
      supabase.from("employees").select("full_name, nip, position").eq("id", userId).single(),
      supabase.from("offices").select("*").limit(1).single(),
    ]);
    if (employee && office) {
      await notifyNewOvertimeRequest(employee, office as Office, {
        work_date: workDate,
        start_time: startTime,
        end_time: endTime,
        description,
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

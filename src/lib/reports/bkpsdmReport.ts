import "server-only";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAttendanceWorkbook } from "@/lib/reports/attendanceWorkbook";
import { rangeDays } from "@/lib/reports/attendanceGrid";
import { buildLeaveDayMap, type AbsenceEmployee } from "@/lib/reports/absenceStatus";
import { sendEmailWithAttachment } from "@/lib/notifications/email";
import type { Office, LeaveRequest } from "@/types";

/**
 * Hitung rentang tanggal laporan berikutnya berdasarkan jadwal yang dipilih
 * admin, relatif terhadap "sekarang" (WITA). Dipakai oleh cron harian untuk
 * menentukan apakah hari ini adalah hari pengiriman laporan.
 */
export function shouldSendToday(schedule: Office["bkpsdm_report_schedule"], now = new Date()) {
  const wita = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Makassar",
    weekday: "short",
    day: "2-digit",
  }).formatToParts(now);
  const weekday = wita.find((p) => p.type === "weekday")?.value ?? "";
  const day = wita.find((p) => p.type === "day")?.value ?? "";

  if (schedule === "daily") return true;
  if (schedule === "weekly") return weekday === "Mon"; // laporan mingguan dikirim tiap Senin
  if (schedule === "monthly") return day === "01"; // laporan bulanan dikirim tiap tanggal 1
  return false;
}

/** Rentang tanggal (YYYY-MM-DD) untuk periode laporan sesuai jadwal, berakhir "kemarin". */
export function reportPeriodFor(schedule: Office["bkpsdm_report_schedule"], now = new Date()) {
  const end = new Date(now);
  end.setDate(end.getDate() - 1); // sampai dengan kemarin (hari ini belum tentu selesai)

  const start = new Date(end);
  if (schedule === "daily") {
    // hanya 1 hari (kemarin)
  } else if (schedule === "weekly") {
    start.setDate(start.getDate() - 6);
  } else {
    start.setDate(1);
    start.setMonth(end.getMonth());
  }

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(start), to: fmt(end) };
}

export async function generateAndSendBkpsdmReport(office: Office, from: string, to: string) {
  const admin = createAdminClient();

  const { data: records, error } = await fetchAllRows((a, b) =>
    admin
      .from("attendance")
      .select("*, employees(full_name, nip, position)")
      .gte("server_time", `${from}T00:00:00+08:00`)
      .lte("server_time", `${to}T23:59:59.999+08:00`)
      .order("server_time", { ascending: true })
      .order("id")
      .range(a, b)
  );

  if (error) {
    throw new Error(`Gagal mengambil data absensi: ${error}`);
  }

  // Pegawai aktif + cuti/izin/sakit yang disetujui pada periode ini, agar sheet Resume laporan
  // otomatis ini juga menandai hari tanpa absen sama sekali sebagai "Tanpa Berita" (bukan sekadar
  // hilang dari laporan), konsisten dengan export manual admin.
  const { data: activeEmployees } = await admin
    .from("employees")
    .select("id, full_name, nip, position, face_enrollment_status, is_active")
    .eq("is_active", true);
  const { data: leaves } = await admin
    .from("leave_requests")
    .select("employee_id, start_date, end_date, type, status")
    .eq("status", "approved")
    .lte("start_date", to)
    .gte("end_date", from);
  const leaveMap = buildLeaveDayMap(
    (leaves ?? []) as Pick<LeaveRequest, "employee_id" | "start_date" | "end_date" | "type" | "status">[]
  );
  const absenceInput = {
    employees: (activeEmployees ?? []) as AbsenceEmployee[],
    days: rangeDays(from, to),
    leaveMap,
  };

  const workbook = await buildAttendanceWorkbook(records, undefined, undefined, absenceInput);
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `Rekap-Absensi-${office.name.replace(/\s+/g, "-")}_${from}_sd_${to}.xlsx`;

  const sentTo: string[] = [];

  if (office.bkpsdm_report_email) {
    await sendEmailWithAttachment({
      to: office.bkpsdm_report_email,
      subject: `Laporan Absensi ${office.name} — ${from} s/d ${to}`,
      html: `<p>Terlampir rekap absensi otomatis ${office.name} periode <b>${from}</b> s/d <b>${to}</b>.</p>
             <p>Laporan ini dikirim otomatis oleh Sistem Absensi Digital sesuai jadwal (${office.bkpsdm_report_schedule}) yang diatur Admin.</p>`,
      attachmentBuffer: buffer as ArrayBuffer,
      attachmentFilename: filename,
    });
    sentTo.push(`email:${office.bkpsdm_report_email}`);
  }

  if (office.bkpsdm_webhook_url) {
    const base64 = Buffer.from(buffer as ArrayBuffer).toString("base64");
    const res = await fetch(office.bkpsdm_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        office: office.name,
        period_from: from,
        period_to: to,
        filename,
        file_base64: base64,
        record_count: records?.length ?? 0,
        sent_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      throw new Error(`Webhook BKPSDM gagal (${res.status}): ${await res.text().catch(() => "")}`);
    }
    sentTo.push(`webhook:${office.bkpsdm_webhook_url}`);
  }

  await admin
    .from("offices")
    .update({ bkpsdm_last_sent_at: new Date().toISOString() })
    .eq("id", office.id);

  return { sentTo, recordCount: records?.length ?? 0 };
}

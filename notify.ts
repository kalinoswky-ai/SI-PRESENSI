import "server-only";
import type { Employee, LeaveType, Office } from "@/types";
import { LEAVE_TYPE_LABEL } from "@/types";
import { formatWita } from "@/lib/geo";
import { sendWhatsAppToMany } from "./whatsapp";
import { sendTelegramMessage } from "./telegram";

/**
 * Kirim notifikasi keterlambatan ke admin/pengawas (dan opsional ke pegawai
 * ybs) lewat WhatsApp dan/atau Telegram, sesuai pengaturan di tabel `offices`.
 *
 * PENTING: fungsi ini SENGAJA tidak pernah melempar (throw) error ke
 * pemanggil — kegagalan kirim notifikasi tidak boleh membatalkan atau
 * menggagalkan pencatatan absensi. Semua error hanya dicatat ke log server.
 */
export async function notifyLateAttendance(
  employee: Pick<Employee, "full_name" | "nip" | "position" | "phone">,
  office: Office,
  serverTime: Date
) {
  try {
    const waktu = formatWita(serverTime);
    const message =
      `⚠️ <b>Notifikasi Keterlambatan</b>\n` +
      `Pegawai: ${employee.full_name} (NIP ${employee.nip})\n` +
      `Jabatan: ${employee.position ?? "-"}\n` +
      `Kantor: ${office.name}\n` +
      `Waktu absen masuk: ${waktu}\n` +
      `Jam kerja mulai: ${office.work_start} WITA`;

    const jobs: Promise<void>[] = [];

    if (office.wa_notify_enabled && office.wa_api_token) {
      const numbers = (office.wa_admin_numbers ?? "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      if (office.wa_notify_employee && employee.phone) {
        numbers.push(employee.phone);
      }
      const plainMessage = message.replace(/<\/?b>/g, "");
      if (numbers.length > 0) {
        jobs.push(sendWhatsAppToMany(office, numbers, plainMessage));
      }
    }

    if (office.telegram_notify_enabled && office.telegram_bot_token && office.telegram_chat_id) {
      jobs.push(sendTelegramMessage(office.telegram_bot_token, office.telegram_chat_id, message));
    }

    await Promise.allSettled(jobs);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("notifyLateAttendance gagal (diabaikan, tidak memengaruhi absensi):", err);
  }
}

/**
 * Kirim notifikasi ke admin/pengawas saat ada pengajuan Cuti/Izin/Sakit BARU dari pegawai,
 * supaya admin tahu ada yang menunggu persetujuan di menu Time Off. Best-effort: tidak pernah
 * melempar error dan tidak menggagalkan pengajuan.
 */
export async function notifyNewLeaveRequest(
  employee: Pick<Employee, "full_name" | "nip" | "position">,
  office: Office,
  leave: { type: LeaveType; start_date: string; end_date: string; reason: string }
) {
  try {
    const periode =
      leave.start_date === leave.end_date ? leave.start_date : `${leave.start_date} s/d ${leave.end_date}`;
    const message =
      `📝 <b>Pengajuan ${LEAVE_TYPE_LABEL[leave.type]} Baru</b>\n` +
      `Pegawai: ${employee.full_name} (NIP ${employee.nip ?? "-"})\n` +
      `Jabatan: ${employee.position ?? "-"}\n` +
      `Periode: ${periode}\n` +
      `Alasan: ${leave.reason}\n` +
      `Mohon diproses di menu Time Off (Cuti / Izin).`;

    const jobs: Promise<void>[] = [];

    if (office.wa_notify_enabled && office.wa_api_token) {
      const numbers = (office.wa_admin_numbers ?? "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      if (numbers.length > 0) {
        jobs.push(sendWhatsAppToMany(office, numbers, message.replace(/<\/?b>/g, "")));
      }
    }

    if (office.telegram_notify_enabled && office.telegram_bot_token && office.telegram_chat_id) {
      jobs.push(sendTelegramMessage(office.telegram_bot_token, office.telegram_chat_id, message));
    }

    await Promise.allSettled(jobs);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("notifyNewLeaveRequest gagal (diabaikan, tidak memengaruhi pengajuan):", err);
  }
}

/**
 * Kirim notifikasi ke admin/pengawas saat ada pengajuan LEMBUR baru dari pegawai.
 * Best-effort: tidak pernah melempar error dan tidak menggagalkan pengajuan.
 */
export async function notifyNewOvertimeRequest(
  employee: Pick<Employee, "full_name" | "nip" | "position">,
  office: Office,
  overtime: { work_date: string; start_time: string; end_time: string; description: string }
) {
  try {
    const message =
      `🕒 <b>Pengajuan Lembur Baru</b>\n` +
      `Pegawai: ${employee.full_name} (NIP ${employee.nip ?? "-"})\n` +
      `Jabatan: ${employee.position ?? "-"}\n` +
      `Tanggal: ${overtime.work_date}\n` +
      `Jam: ${overtime.start_time} - ${overtime.end_time} WITA\n` +
      `Pekerjaan: ${overtime.description}\n` +
      `Mohon diproses di menu Lembur.`;

    const jobs: Promise<void>[] = [];

    if (office.wa_notify_enabled && office.wa_api_token) {
      const numbers = (office.wa_admin_numbers ?? "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      if (numbers.length > 0) {
        jobs.push(sendWhatsAppToMany(office, numbers, message.replace(/<\/?b>/g, "")));
      }
    }

    if (office.telegram_notify_enabled && office.telegram_bot_token && office.telegram_chat_id) {
      jobs.push(sendTelegramMessage(office.telegram_bot_token, office.telegram_chat_id, message));
    }

    await Promise.allSettled(jobs);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("notifyNewOvertimeRequest gagal (diabaikan, tidak memengaruhi pengajuan):", err);
  }
}

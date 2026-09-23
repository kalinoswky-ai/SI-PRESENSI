import "server-only";
import type { Employee, Office } from "@/types";
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

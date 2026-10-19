import "server-only";
import type { Office } from "@/types";

/**
 * Kirim pesan WhatsApp lewat gateway berbasis token (default: Fonnte — populer
 * di Indonesia, tidak perlu approval Meta Business, cocok untuk instansi kecil).
 * Provider lain yang formatnya kompatibel (Wablas, dsb.) dapat dipilih di menu
 * Pengaturan; jika field "other" dipilih, request dikirim dalam format Fonnte
 * sebagai baseline — sesuaikan endpoint di bawah bila gateway Anda berbeda.
 *
 * Semua kegagalan di-catch di pemanggil (lihat notify.ts) — notifikasi TIDAK
 * pernah boleh menggagalkan proses absensi itu sendiri.
 */
export async function sendWhatsAppMessage(office: Office, targetNumber: string, message: string) {
  if (!office.wa_api_token) {
    throw new Error("Token WhatsApp API belum diatur di menu Pengaturan.");
  }

  const target = targetNumber.trim().replace(/[^0-9]/g, "");
  if (!target) return;

  // Fonnte (https://fonnte.com/) — satu endpoint umum untuk kirim pesan teks.
  const endpoint = "https://api.fonnte.com/send";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: office.wa_api_token,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ target, message }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gagal mengirim WhatsApp (${res.status}): ${text}`);
  }
}

export async function sendWhatsAppToMany(office: Office, numbers: string[], message: string) {
  const results = await Promise.allSettled(
    numbers.filter(Boolean).map((n) => sendWhatsAppMessage(office, n, message))
  );
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.error("Sebagian notifikasi WhatsApp gagal terkirim:", failed);
  }
}

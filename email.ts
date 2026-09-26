import "server-only";

/**
 * Kirim email dengan lampiran memakai Resend (https://resend.com) — gratis
 * hingga 3.000 email/bulan, cukup untuk laporan bulanan/mingguan ke BKPSDM.
 * Butuh env var RESEND_API_KEY (lihat .env.example) dan domain pengirim yang
 * sudah diverifikasi di dashboard Resend (atau pakai domain sandbox mereka
 * untuk uji coba).
 */
export async function sendEmailWithAttachment(opts: {
  to: string;
  subject: string;
  html: string;
  attachmentBuffer: Buffer | ArrayBuffer;
  attachmentFilename: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY belum diatur di environment variables.");
  }

  const buffer = Buffer.isBuffer(opts.attachmentBuffer)
    ? opts.attachmentBuffer
    : Buffer.from(opts.attachmentBuffer);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "Absensi Digital <onboarding@resend.dev>",
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      attachments: [
        {
          filename: opts.attachmentFilename,
          content: buffer.toString("base64"),
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gagal mengirim email (${res.status}): ${text}`);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAndSendBkpsdmReport, reportPeriodFor, shouldSendToday } from "@/lib/reports/bkpsdmReport";
import type { Office } from "@/types";

// WAJIB dynamic: endpoint ini dipanggil oleh Vercel Cron setiap hari dan harus
// selalu mengevaluasi ulang tanggal/pengaturan saat itu — tidak boleh di-cache
// sebagai halaman statis dari hasil build.
export const dynamic = "force-dynamic";

/**
 * Endpoint ini dipanggil oleh Vercel Cron (lihat vercel.json — dijadwalkan
 * berjalan setiap hari). Endpoint sendiri yang menentukan apakah HARI INI
 * adalah hari pengiriman laporan, berdasarkan jadwal yang dipilih Admin di
 * menu Pengaturan (harian/mingguan/bulanan).
 *
 * Diproteksi dengan header Authorization: Bearer <CRON_SECRET> — Vercel Cron
 * mengirimkan header ini secara otomatis bila env var CRON_SECRET diatur di
 * project Vercel Anda.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const { data: office } = await admin.from("offices").select("*").limit(1).single();

  if (!office) {
    return NextResponse.json({ skipped: true, reason: "Konfigurasi kantor belum ada." });
  }
  if (!(office as Office).bkpsdm_report_enabled) {
    return NextResponse.json({ skipped: true, reason: "Laporan otomatis BKPSDM belum diaktifkan." });
  }
  if (!(office as Office).bkpsdm_report_email && !(office as Office).bkpsdm_webhook_url) {
    return NextResponse.json({ skipped: true, reason: "Belum ada email/webhook tujuan yang diatur." });
  }

  const schedule = (office as Office).bkpsdm_report_schedule;
  if (!shouldSendToday(schedule)) {
    return NextResponse.json({ skipped: true, reason: `Bukan jadwal pengiriman (${schedule}) hari ini.` });
  }

  const { from, to } = reportPeriodFor(schedule);

  try {
    const result = await generateAndSendBkpsdmReport(office as Office, from, to);
    return NextResponse.json({ success: true, period: { from, to }, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal mengirim laporan otomatis." },
      { status: 500 }
    );
  }
}

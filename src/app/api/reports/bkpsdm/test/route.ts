import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAndSendBkpsdmReport } from "@/lib/reports/bkpsdmReport";
import type { Office } from "@/types";

/**
 * Dipanggil dari tombol "Kirim Uji Coba Sekarang" di menu Admin > Pengaturan.
 * Mengirim laporan untuk periode bulan berjalan (1 s/d hari ini), mengabaikan
 * jadwal — khusus untuk memastikan konfigurasi email/webhook sudah benar.
 */
export async function POST() {
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
    return NextResponse.json({ error: "Hanya Admin yang dapat menguji fitur ini." }, { status: 403 });
  }

  const { data: office } = await supabase.from("offices").select("*").limit(1).single();
  if (!office) {
    return NextResponse.json({ error: "Konfigurasi kantor belum ada." }, { status: 400 });
  }
  if (!(office as Office).bkpsdm_report_email && !(office as Office).bkpsdm_webhook_url) {
    return NextResponse.json(
      { error: "Isi dan simpan dahulu Email Tujuan atau Webhook URL sebelum menguji." },
      { status: 400 }
    );
  }

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);

  try {
    const result = await generateAndSendBkpsdmReport(office as Office, from, to);
    return NextResponse.json({ success: true, period: { from, to }, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal mengirim laporan uji coba." },
      { status: 500 }
    );
  }
}

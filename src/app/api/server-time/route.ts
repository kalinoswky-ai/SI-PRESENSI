import { NextResponse } from "next/server";

// PENTING: tanpa baris di bawah, Next.js menganggap route GET ini statis dan meng-"bekukan"
// jamnya saat build/deploy — jam yang dikirim selalu waktu deploy terakhir (bukan waktu sekarang),
// sehingga "Server Clock" di layar pegawai tertinggal belasan menit/jam dari jam nasional.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Endpoint jam server untuk tampilan "Server Clock" (jam yang tidak bisa dimanipulasi dengan
// mengubah jam perangkat). Validasi absensi sesungguhnya tetap dihitung ulang di server pada
// /api/attendance/clock; endpoint ini hanya untuk tampilan & penentuan hari (Senin/Rabu/Jumat).
export async function GET() {
  const now = Date.now();
  return NextResponse.json(
    { serverTime: new Date(now).toISOString(), epochMs: now },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}

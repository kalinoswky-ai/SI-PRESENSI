import { NextResponse } from "next/server";

// Endpoint sederhana agar klien dapat menampilkan "Server Clock" — jam yang
// tidak bisa dimanipulasi dengan mengubah jam di perangkat pegawai.
// Validasi absensi yang sesungguhnya tetap dihitung ulang di server pada
// /api/attendance/clock, endpoint ini hanya untuk tampilan jam berjalan di UI.
export async function GET() {
  return NextResponse.json({ serverTime: new Date().toISOString() });
}

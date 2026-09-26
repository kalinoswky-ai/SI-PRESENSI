import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Menghasilkan signed URL sementara (privat) untuk lampiran cuti/izin.
// Hanya bisa diakses oleh: admin, atau pegawai pemilik pengajuan tersebut.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Path lampiran tidak diberikan." }, { status: 400 });
  }

  // RLS pada storage.objects sudah membatasi akses ke: pemilik folder (uid) atau admin.
  const { data, error } = await supabase.storage
    .from("leave-attachments")
    .createSignedUrl(path, 60 * 5);

  if (error || !data) {
    return NextResponse.json({ error: "Lampiran tidak ditemukan atau akses ditolak." }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}

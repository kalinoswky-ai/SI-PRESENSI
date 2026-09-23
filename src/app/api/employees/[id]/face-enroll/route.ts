import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Pegawai merekam wajahnya SENDIRI lewat akun mereka. Data disimpan sebagai
// "pending" — TIDAK langsung menjadi face_descriptor aktif — sampai Admin
// menyetujuinya secara manual di halaman Kelola Pegawai.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  // Hanya boleh merekam wajah untuk akun miliknya sendiri
  if (userData.user.id !== params.id) {
    return NextResponse.json({ error: "Tidak diizinkan merekam wajah akun lain." }, { status: 403 });
  }

  const formData = await request.formData();
  const descriptorRaw = formData.get("descriptor") as string | null;
  const photo = formData.get("photo") as File | null;

  if (!descriptorRaw || !photo) {
    return NextResponse.json({ error: "Data wajah tidak lengkap." }, { status: 400 });
  }

  let descriptor: number[];
  try {
    descriptor = JSON.parse(descriptorRaw);
  } catch {
    return NextResponse.json({ error: "Data wajah tidak valid." }, { status: 400 });
  }

  const admin = createAdminClient();

  const path = `${params.id}/pending-${Date.now()}.jpg`;
  const { error: uploadError } = await admin.storage
    .from("profile-photos")
    .upload(path, await photo.arrayBuffer(), { contentType: "image/jpeg" });

  if (uploadError) {
    return NextResponse.json({ error: "Gagal mengunggah foto." }, { status: 500 });
  }
  const { data: publicUrl } = admin.storage.from("profile-photos").getPublicUrl(path);

  const { error } = await admin
    .from("employees")
    .update({
      pending_face_descriptor: descriptor,
      pending_photo_url: publicUrl.publicUrl,
      face_enrollment_status: "pending",
      face_rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

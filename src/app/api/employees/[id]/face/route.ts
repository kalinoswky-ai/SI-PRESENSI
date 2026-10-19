import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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
    return NextResponse.json({ error: "Hanya Admin yang dapat mendaftarkan ulang wajah." }, { status: 403 });
  }

  const formData = await request.formData();
  const descriptorRaw = formData.get("descriptor") as string | null;
  const photo = formData.get("photo") as File | null;

  if (!descriptorRaw) {
    return NextResponse.json({ error: "Data wajah tidak ditemukan." }, { status: 400 });
  }

  const admin = createAdminClient();
  let photoUrl: string | undefined;

  if (photo) {
    const path = `${params.id}/${Date.now()}.jpg`;
    const { error: uploadError } = await admin.storage
      .from("profile-photos")
      .upload(path, await photo.arrayBuffer(), { contentType: "image/jpeg" });
    if (!uploadError) {
      const { data: publicUrl } = admin.storage.from("profile-photos").getPublicUrl(path);
      photoUrl = publicUrl.publicUrl;
    }
  }

  const { error } = await admin
    .from("employees")
    .update({
      face_descriptor: JSON.parse(descriptorRaw),
      ...(photoUrl ? { photo_url: photoUrl } : {}),
      face_enrollment_status: "approved",
      pending_face_descriptor: null,
      pending_photo_url: null,
      face_rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}

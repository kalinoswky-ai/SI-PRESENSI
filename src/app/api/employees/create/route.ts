import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  // 1. Pastikan pemanggil adalah admin yang sedang login
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
    return NextResponse.json({ error: "Hanya Admin yang dapat menambah pegawai." }, { status: 403 });
  }

  const formData = await request.formData();
  const nipRaw = (formData.get("nip") as string) || "";
  const fullName = formData.get("full_name") as string;
  const position = (formData.get("position") as string) || null;
  const email = formData.get("email") as string;
  const phone = (formData.get("phone") as string) || null;
  const password = formData.get("password") as string;
  const role = ((formData.get("role") as string) || "employee") as "employee" | "admin";
  const descriptorRaw = formData.get("descriptor") as string | null;
  const photo = formData.get("photo") as File | null;

  // NIP wajib untuk pegawai biasa, opsional untuk admin (admin hanya mengontrol sistem)
  const nip = nipRaw.trim() || null;
  if (role !== "admin" && !nip) {
    return NextResponse.json({ error: "NIP wajib diisi untuk akun Pegawai." }, { status: 400 });
  }
  if (!fullName || !email || !password) {
    return NextResponse.json({ error: "Data pegawai tidak lengkap." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 2. Buat akun auth
  const { data: created, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createUserError || !created.user) {
    return NextResponse.json(
      { error: createUserError?.message ?? "Gagal membuat akun." },
      { status: 400 }
    );
  }

  const newUserId = created.user.id;

  // 3. Upload foto profil (opsional)
  let photoUrl: string | null = null;
  if (photo) {
    const path = `${newUserId}/${Date.now()}.jpg`;
    const { error: uploadError } = await admin.storage
      .from("profile-photos")
      .upload(path, await photo.arrayBuffer(), { contentType: "image/jpeg" });
    if (!uploadError) {
      const { data: publicUrl } = admin.storage.from("profile-photos").getPublicUrl(path);
      photoUrl = publicUrl.publicUrl;
    }
  }

  // 4. Simpan profil pegawai
  const faceDescriptor = descriptorRaw ? JSON.parse(descriptorRaw) : null;

  const { error: insertError } = await admin.from("employees").insert({
    id: newUserId,
    nip,
    full_name: fullName,
    position,
    email,
    phone,
    role,
    face_descriptor: faceDescriptor,
    photo_url: photoUrl,
    is_active: true,
  });

  if (insertError) {
    // rollback: hapus akun auth yang sudah dibuat agar tidak menjadi akun yatim
    await admin.auth.admin.deleteUser(newUserId);
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, id: newUserId });
}

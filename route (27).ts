import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MIN_LENGTH = 8;

/**
 * Ganti password WAJIB (login pertama, akun hasil import Excel).
 * Dilakukan di server agar flag must_change_password hanya dimatikan bila password
 * benar-benar berganti: password lama diverifikasi, password baru harus berbeda, baru flag dicabut.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user || !user.email) {
    return NextResponse.json({ error: "Sesi login tidak ditemukan. Silakan login ulang." }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }
  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";

  if (newPassword.length < MIN_LENGTH) {
    return NextResponse.json({ error: `Password baru minimal ${MIN_LENGTH} karakter.` }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: "Password baru harus berbeda dari password awal." }, { status: 400 });
  }

  // Verifikasi password lama memakai klien sementara (tanpa menyentuh cookie sesi yang sedang aktif).
  const verifier = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) {
    return NextResponse.json({ error: "Password awal salah." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password: newPassword });
  if (updateError) {
    return NextResponse.json({ error: "Gagal mengubah password: " + updateError.message }, { status: 400 });
  }

  const { error: flagError } = await admin
    .from("employees")
    .update({ must_change_password: false })
    .eq("id", user.id);
  if (flagError) {
    return NextResponse.json({ error: "Password berubah, tetapi status akun gagal diperbarui: " + flagError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

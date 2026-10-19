import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import ForcePasswordChange from "@/components/ForcePasswordChange";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Halaman wajib ganti password — hanya untuk akun dengan must_change_password = true
// (akun hasil import Excel). Middleware juga menjaga rute ini; pengecekan di sini sebagai lapis kedua.
export default async function ForceChangePasswordPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("full_name, must_change_password")
    .eq("id", userData.user.id)
    .single();
  if (!employee || employee.must_change_password !== true) redirect("/");

  return (
    <main className="app-shell flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/70 p-2 shadow-sm">
            <Image
              src="/logo-sumba-barat.gif"
              alt="Logo Kabupaten Sumba Barat"
              width={48}
              height={48}
              className="h-full w-full object-contain"
              unoptimized
            />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Selamat datang, {employee.full_name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Untuk keamanan akun, Anda wajib mengganti password awal dari Admin sebelum memakai aplikasi.
          </p>
        </div>
        <ForcePasswordChange />
      </div>
    </main>
  );
}

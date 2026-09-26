import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Halaman ini membaca sesi login terkini setiap request — jangan pernah di-cache Next.js
// (tanpa ini, hasil redirect/otentikasi bisa "nyangkut" pada keadaan lama).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    const { data: employee } = await supabase
      .from("employees")
      .select("role")
      .eq("id", data.user.id)
      .single();
    redirect(employee?.role === "admin" ? "/admin" : "/dashboard");
  }
  redirect("/login");
}

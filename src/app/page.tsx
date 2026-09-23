import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

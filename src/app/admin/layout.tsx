import AdminSidebar from "@/components/AdminSidebar";
import { createClient } from "@/lib/supabase/server";

// Badge jumlah pengajuan menunggu harus selalu terbaru pada setiap navigasi.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { count } = await supabase
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <div className="app-shell flex flex-col lg:flex-row">
      <AdminSidebar orgName="Inspektorat Kab. Sumba Barat" pendingLeave={count ?? 0} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

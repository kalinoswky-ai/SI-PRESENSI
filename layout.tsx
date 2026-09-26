import AdminSidebar from "@/components/AdminSidebar";
import { createClient } from "@/lib/supabase/server";
import { getViewerProfile } from "@/lib/admin/auth";

// Badge jumlah pengajuan menunggu harus selalu terbaru pada setiap navigasi.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [{ count }, { count: overtimeCount }, viewer] = await Promise.all([
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    // Bila migrasi lembur belum dijalankan, query ini error → count null → badge 0 (tidak memutus layout).
    supabase.from("overtime_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    getViewerProfile(),
  ]);

  const viewerLabel = viewer ? [viewer.position, viewer.full_name].filter(Boolean).join(" — ") : null;

  return (
    <div className="app-shell flex flex-col lg:flex-row">
      <AdminSidebar
        orgName="Inspektorat Kab. Sumba Barat"
        pendingLeave={count ?? 0}
        pendingOvertime={overtimeCount ?? 0}
        role={viewer?.role ?? "admin"}
        viewerLabel={viewerLabel}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

import EmployeeNav from "@/components/EmployeeNav";
import { getViewerProfile } from "@/lib/admin/auth";

// Perlu tahu role tiap kali render agar tab "Statistik" (khusus pimpinan) selalu akurat.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewerProfile();
  const isPimpinan = viewer?.role === "pimpinan";

  return (
    <div className="app-shell employee-dashboard">
      <EmployeeNav
        title={isPimpinan ? "Absensi Digital — Pimpinan" : "Absensi Digital — Pegawai"}
        isPimpinan={isPimpinan}
      />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:pb-6">{children}</main>
    </div>
  );
}

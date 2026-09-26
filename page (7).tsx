import { redirect } from "next/navigation";
import { getViewerProfile } from "@/lib/admin/auth";
import EmployeeAddTabs from "@/components/EmployeeAddTabs";
import ImportEmployeesPanel from "@/components/ImportEmployeesPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ImportEmployeesPage() {
  const viewer = await getViewerProfile();
  if (viewer?.role !== "admin") redirect("/admin");

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-lg font-bold text-slate-900">Tambah Pegawai</h1>
      <EmployeeAddTabs active="import" />
      <ImportEmployeesPanel />
    </div>
  );
}

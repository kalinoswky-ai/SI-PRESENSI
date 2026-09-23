import EmployeeNav from "@/components/EmployeeNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <EmployeeNav title="Absensi Digital — Pegawai" />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:pb-6">{children}</main>
    </div>
  );
}

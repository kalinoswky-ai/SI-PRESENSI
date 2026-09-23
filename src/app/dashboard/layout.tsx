import Navbar from "@/components/Navbar";

const links = [
  { href: "/dashboard", label: "Absen" },
  { href: "/dashboard/history", label: "Riwayat Saya" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar links={links} title="Absensi Digital — Pegawai" />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

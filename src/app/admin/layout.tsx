import Navbar from "@/components/Navbar";

const links = [
  { href: "/admin", label: "Ringkasan" },
  { href: "/admin/employees", label: "Pegawai" },
  { href: "/admin/attendance", label: "Absensi" },
  { href: "/admin/leave", label: "Cuti/Izin" },
  { href: "/admin/settings", label: "Pengaturan" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar links={links} title="Absensi Digital — Admin" />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

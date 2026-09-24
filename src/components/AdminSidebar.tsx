"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Clock,
  Briefcase,
  BarChart3,
  Users,
  Settings,
  LogOut,
  MapPin,
  CalendarClock,
  Bell,
  FileSpreadsheet,
} from "lucide-react";

const mainLinks = [
  { href: "/admin", label: "Dashboard", sublabel: "Ringkasan", icon: LayoutDashboard },
  { href: "/admin/attendance", label: "Timesheets", sublabel: "Absensi", icon: Clock },
  { href: "/admin/leave", label: "Time Off", sublabel: "Cuti / Izin", icon: Briefcase },
  { href: "/admin/reports", label: "Reports", sublabel: "Laporan", icon: BarChart3 },
  { href: "/admin/employees", label: "People", sublabel: "Pegawai", icon: Users },
];

const settingsLinks = [
  { href: "/admin/settings#lokasi", label: "Locations", sublabel: "Lokasi & Geofencing", icon: MapPin },
  { href: "/admin/settings#jam-kerja", label: "Work Schedules", sublabel: "Jam Kerja", icon: CalendarClock },
  { href: "/admin/settings#notifikasi", label: "Notifications", sublabel: "WhatsApp / Telegram", icon: Bell },
  { href: "/admin/settings#integrasi", label: "Integrations", sublabel: "Laporan BKPSDM", icon: FileSpreadsheet },
];

export default function AdminSidebar({ orgName, pendingLeave = 0 }: { orgName: string; pendingLeave?: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) => pathname === href;
  const isSettingsActive = pathname === "/admin/settings";

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="glass-sidebar hidden w-64 shrink-0 flex-col border-r lg:flex">
        <div className="flex items-center gap-2.5 border-b border-white/40 px-5 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/70 p-1.5 shadow-sm">
            <Image
              src="/logo-sumba-barat.gif"
              alt="Logo Kabupaten Sumba Barat"
              width={32}
              height={32}
              className="h-full w-full object-contain"
              unoptimized
            />
          </span>
          <div>
            <p className="text-sm font-bold leading-tight text-slate-900">Absensi Digital</p>
            <p className="text-xs leading-tight text-slate-500">{orgName}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {mainLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive(link.href)
                      ? "bg-gradient-to-r from-brand-600 to-emerald-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-white/60"
                  }`}
                >
                  <link.icon size={18} />
                  <span className="flex flex-col leading-tight">
                    <span>{link.label}</span>
                    <span
                      className={`text-[11px] font-normal ${
                        isActive(link.href) ? "text-white/70" : "text-slate-400"
                      }`}
                    >
                      {link.sublabel}
                    </span>
                  </span>
                  {link.href === "/admin/leave" && pendingLeave > 0 && (
                    <span className="ml-auto rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
                      {pendingLeave}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          <p className="mb-1 mt-6 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Settings <span className="normal-case text-slate-400/70">· Pengaturan</span>
          </p>
          <ul className="space-y-0.5">
            {settingsLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isSettingsActive ? "text-brand-700 hover:bg-white/60" : "text-slate-600 hover:bg-white/60"
                  }`}
                >
                  <link.icon size={17} />
                  <span className="flex flex-col leading-tight">
                    <span>{link.label}</span>
                    <span className="text-[11px] font-normal text-slate-400">{link.sublabel}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-white/40 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white/60"
          >
            <LogOut size={18} />
            Keluar
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="glass-nav lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 font-semibold text-slate-800">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70 p-1 shadow-sm">
              <Image
                src="/logo-sumba-barat.gif"
                alt="Logo Kabupaten Sumba Barat"
                width={24}
                height={24}
                className="h-full w-full object-contain"
                unoptimized
              />
            </span>
            <span className="text-sm">Absensi Digital — Admin</span>
          </div>
          <button onClick={handleLogout} className="text-slate-500">
            <LogOut size={18} />
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-white/30 px-3 py-2">
          {[...mainLinks, { href: "/admin/settings", label: "Settings", sublabel: "", icon: Settings }].map(
            (link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  isActive(link.href) || (link.href === "/admin/settings" && isSettingsActive)
                    ? "bg-gradient-to-r from-brand-600 to-emerald-600 text-white"
                    : "text-slate-600"
                }`}
              >
                <link.icon size={15} />
                {link.label}
                {link.href === "/admin/leave" && pendingLeave > 0 && (
                  <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                    {pendingLeave}
                  </span>
                )}
              </Link>
            )
          )}
        </nav>
      </header>
    </>
  );
}

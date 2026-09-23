"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut, ShieldCheck, Home, Clock, CalendarDays, Briefcase, ScanFace } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Beranda", sublabel: "Home / Time Clock", icon: Home },
  { href: "/dashboard/history", label: "Riwayat", sublabel: "Timesheets", icon: CalendarDays },
  { href: "/dashboard/leave", label: "Cuti/Izin", sublabel: "Time Off", icon: Briefcase },
  { href: "/dashboard/face-enrollment", label: "Wajah Saya", sublabel: "Face Enrollment", icon: ScanFace },
];

export default function EmployeeNav({ title }: { title: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 font-semibold text-slate-800">
            <ShieldCheck className="text-brand-600" size={22} />
            <span className="text-sm sm:text-base">{title}</span>
          </div>

          <nav className="hidden gap-1 sm:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  pathname === link.href
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <link.icon size={16} />
                {link.label}
              </Link>
            ))}
          </nav>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </header>

      {/* Mobile bottom tab bar — mirrors the Jibble mobile app's Home / Timesheets / Time Off layout */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white sm:hidden">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition ${
              pathname === link.href ? "text-brand-700" : "text-slate-500"
            }`}
          >
            <link.icon size={20} />
            {link.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
